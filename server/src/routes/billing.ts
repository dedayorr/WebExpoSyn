import express, { type RequestHandler, type Router } from 'express'
import { z } from 'zod'
import { logEvent } from '../lib/logger.js'
import {
  eventId,
  isPro,
  isValidPaystackSignature,
  metadataUserId,
  periodEndFrom,
  planCodeOf,
  type BillingStore,
  type PaystackApi,
  type PaystackTransaction,
  type Subscription,
  type SubscriptionUpdate,
} from '../services/billing.js'
import { isUuid } from '../services/store.js'

export interface BillingDeps {
  auth: RequestHandler
  limiter: RequestHandler
  store: BillingStore | null
  paystack: PaystackApi | null
  secretKey?: string
  planCode?: string
  siteLimit: number
  priceKobo: number
}

const verifyBody = z.object({ reference: z.string().trim().regex(/^[A-Za-z0-9._=-]{1,100}$/, 'Invalid payment reference.') })

const unavailable = { error: { code: 'BILLING_UNAVAILABLE', message: 'Upgrading is not available right now. Please try again later.' } }

/**
 * What we keep of a webhook event. Paystack events include the customer's
 * email, phone and IP, card details and a reusable card authorization code;
 * none of that is needed, so it is never stored.
 */
export function minimalEvent(event: string, data: Record<string, any>) {
  const pick = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? v : undefined)
  return {
    event,
    reference: pick(data.reference),
    status: pick(data.status),
    amount: pick(data.amount),
    currency: pick(data.currency),
    paid_at: pick(data.paid_at),
    plan_code: pick(data.plan?.plan_code ?? data.plan_object?.plan_code ?? data.plan),
    subscription_code: pick(data.subscription_code ?? data.subscription?.subscription_code),
    next_payment_date: pick(data.next_payment_date),
    customer_code: pick(data.customer?.customer_code),
  }
}

/** Keeps the later of two period ends, so replays and out-of-order events never shorten a paid period. */
function laterEnd(existing: string | null, candidate: string): string {
  if (existing && Date.parse(existing) > Date.parse(candidate)) return existing
  return candidate
}

/** A payment counts toward Pro only if it is ours: right plan (when stated), NGN, full price. */
function isProPayment(tx: PaystackTransaction, planCode: string | undefined, priceKobo: number): boolean {
  if (tx.status !== 'success') return false
  if (tx.currency !== 'NGN' || !(tx.amount >= priceKobo)) return false
  const code = planCodeOf(tx)
  return !code || code === planCode
}

export function billingSummary(sub: Subscription, domains: string[] | null, deps: Pick<BillingDeps, 'siteLimit' | 'priceKobo' | 'paystack' | 'store'>) {
  const pro = isPro(sub)
  return {
    billingEnabled: Boolean(deps.paystack && deps.store),
    plan: pro ? 'pro' : 'free',
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd,
    sitesUsed: domains?.length ?? 0,
    siteLimit: pro ? null : deps.siteLimit,
    domains: domains ?? [],
    priceKobo: deps.priceKobo,
    canManage: Boolean(sub.subscriptionCode && sub.plan === 'pro'),
  }
}

/** Webhook: mounted BEFORE express.json() because the signature covers the raw body. */
export function billingWebhook(deps: BillingDeps): RequestHandler[] {
  const handler: RequestHandler = async (req, res) => {
    const { store, secretKey, planCode, priceKobo } = deps
    if (!store || !secretKey) {
      res.status(503).json(unavailable)
      return
    }
    const raw = req.body
    if (!Buffer.isBuffer(raw) || !isValidPaystackSignature(raw, req.get('x-paystack-signature'), secretKey)) {
      logEvent('billing.webhook_bad_signature', { ip: req.ip })
      res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature.' } })
      return
    }

    let body: { event?: unknown; data?: Record<string, any> }
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid JSON.' } })
      return
    }
    const event = typeof body.event === 'string' ? body.event : 'unknown'
    const data = body.data && typeof body.data === 'object' ? body.data : {}
    const id = eventId(raw)
    let recorded = false

    try {
      const customerCode: string | undefined = data.customer?.customer_code
      let userId = metadataUserId(data.metadata)
      if (userId && !isUuid(userId)) userId = null
      if (!userId && typeof customerCode === 'string') userId = await store.findUserByCustomer(customerCode)

      recorded = await store.recordEvent(id, event, userId, minimalEvent(event, data))
      if (!recorded) {
        res.json({ received: true, duplicate: true })
        return
      }
      if (!userId) {
        logEvent('billing.webhook_unmatched', { event })
        res.json({ received: true })
        return
      }

      const sub = await store.getSubscription(userId)
      const sameSub = (code: unknown) => !sub.subscriptionCode || sub.subscriptionCode === code
      let update: SubscriptionUpdate | null = null

      switch (event) {
        case 'charge.success': {
          const tx = data as PaystackTransaction
          if (!isProPayment(tx, planCode, priceKobo) || planCodeOf(tx) !== planCode) break
          update = {
            plan: 'pro',
            status: 'active',
            currentPeriodEnd: laterEnd(sub.currentPeriodEnd, periodEndFrom(tx.paid_at ?? new Date(), true)),
            ...(customerCode ? { customerCode } : {}),
          }
          break
        }
        case 'subscription.create':
        case 'subscription.enable': {
          if (data.plan?.plan_code !== planCode) break
          update = {
            plan: 'pro',
            status: 'active',
            subscriptionCode: String(data.subscription_code),
            emailToken: String(data.email_token),
            ...(data.next_payment_date
              ? { currentPeriodEnd: laterEnd(sub.currentPeriodEnd, periodEndFrom(data.next_payment_date, false)) }
              : {}),
            ...(customerCode ? { customerCode } : {}),
          }
          break
        }
        case 'subscription.not_renew':
          if (sameSub(data.subscription_code)) update = { status: 'non_renewing' }
          break
        case 'subscription.disable':
          if (sameSub(data.subscription_code)) update = { plan: 'free', status: 'cancelled' }
          break
        case 'invoice.payment_failed':
          if (sameSub(data.subscription?.subscription_code)) update = { status: 'attention' }
          break
      }

      if (update) await store.updateSubscription(userId, update)
      logEvent('billing.webhook', { event, user: userId, applied: Boolean(update) })
      res.json({ received: true })
    } catch (err) {
      // Let Paystack's retry apply it: un-record so the retry isn't treated as a duplicate.
      if (recorded) await store.forgetEvent(id).catch(() => {})
      logEvent('billing.webhook_failed', { event, reason: err instanceof Error ? err.message : 'unknown' })
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Could not process event.' } })
    }
  }
  return [express.raw({ type: 'application/json', limit: '100kb' }), handler]
}

export function billingRouter(deps: BillingDeps): Router {
  const { auth, limiter, store, paystack, planCode, priceKobo } = deps
  const router = express.Router()

  /** Current plan and website usage. */
  router.get('/', auth, async (req, res) => {
    const userId = req.user!.id
    if (!store || !isUuid(userId)) {
      res.json(billingSummary({ plan: 'free', status: 'inactive', currentPeriodEnd: null, customerCode: null, subscriptionCode: null, emailToken: null }, null, deps))
      return
    }
    const [sub, domains] = await Promise.all([store.getSubscription(userId), store.listScannedDomains(userId)])
    res.json(billingSummary(sub, domains, deps))
  })

  /** Starts a Paystack checkout for the Pro plan. */
  router.post('/checkout', auth, limiter, async (req, res) => {
    const userId = req.user!.id
    if (!store || !paystack || !isUuid(userId)) {
      res.status(503).json(unavailable)
      return
    }
    const email = req.user!.email
    if (!email) {
      res.status(400).json({ error: { code: 'NO_EMAIL', message: 'Your account has no email address to bill.' } })
      return
    }
    if (isPro(await store.getSubscription(userId))) {
      res.status(409).json({ error: { code: 'ALREADY_PRO', message: 'You already have WebExpoSyn Pro.' } })
      return
    }
    const { authorizationUrl, reference } = await paystack.initialize({ email, userId })
    logEvent('billing.checkout_started', { user: userId, reference })
    res.json({ url: authorizationUrl })
  })

  /** Confirms a payment after Paystack redirects back (the webhook does the same independently). */
  router.post('/verify', auth, limiter, async (req, res) => {
    const userId = req.user!.id
    if (!store || !paystack || !isUuid(userId)) {
      res.status(503).json(unavailable)
      return
    }
    const { reference } = verifyBody.parse(req.body)
    const tx = await paystack.verify(reference)

    if (metadataUserId(tx.metadata) !== userId) {
      logEvent('billing.verify_wrong_user', { user: userId, reference })
      res.status(403).json({ error: { code: 'PAYMENT_NOT_YOURS', message: 'This payment belongs to a different account.' } })
      return
    }
    if (!isProPayment(tx, planCode, priceKobo)) {
      logEvent('billing.verify_not_paid', { user: userId, reference, status: tx.status })
      res.status(402).json({ error: { code: 'PAYMENT_NOT_COMPLETED', message: 'We could not confirm this payment. If you were charged, it will update shortly.' } })
      return
    }

    const sub = await store.getSubscription(userId)
    const end = periodEndFrom(tx.paid_at ?? new Date(), true)
    if (Date.parse(end) > Date.now()) {
      const update: SubscriptionUpdate = { plan: 'pro', status: 'active', currentPeriodEnd: laterEnd(sub.currentPeriodEnd, end) }
      if (tx.customer?.customer_code) update.customerCode = tx.customer.customer_code
      // Best effort: pick up the subscription so "Manage subscription" works right away.
      if (typeof tx.customer?.id === 'number') {
        try {
          const subs = await paystack.listSubscriptions(tx.customer.id)
          const match = subs.find((s) => s.plan?.plan_code === planCode && s.status === 'active')
          if (match) {
            update.subscriptionCode = match.subscription_code
            update.emailToken = match.email_token
          }
        } catch (err) {
          logEvent('billing.subscription_lookup_failed', { user: userId, reason: err instanceof Error ? err.message : 'unknown' })
        }
      }
      await store.updateSubscription(userId, update)
      logEvent('billing.upgraded', { user: userId, reference })
    }

    const [fresh, domains] = await Promise.all([store.getSubscription(userId), store.listScannedDomains(userId)])
    res.json(billingSummary(fresh, domains, deps))
  })

  /** Paystack-hosted page where users update their card or cancel. */
  router.post('/manage', auth, limiter, async (req, res) => {
    const userId = req.user!.id
    if (!store || !paystack || !isUuid(userId)) {
      res.status(503).json(unavailable)
      return
    }
    const sub = await store.getSubscription(userId)
    if (!sub.subscriptionCode) {
      res.status(404).json({ error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription to manage.' } })
      return
    }
    res.json({ url: await paystack.manageLink(sub.subscriptionCode) })
  })

  return router
}

