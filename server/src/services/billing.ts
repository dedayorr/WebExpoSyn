import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import { MAX_SCANS_PER_USER } from './store.js'

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export type Plan = 'free' | 'pro'
export type SubStatus = 'inactive' | 'active' | 'non_renewing' | 'attention' | 'cancelled'

export interface Subscription {
  plan: Plan
  status: SubStatus
  currentPeriodEnd: string | null
  customerCode: string | null
  subscriptionCode: string | null
  emailToken: string | null
}

export const FREE_SUBSCRIPTION: Subscription = {
  plan: 'free',
  status: 'inactive',
  currentPeriodEnd: null,
  customerCode: null,
  subscriptionCode: null,
  emailToken: null,
}

/**
 * Pro features apply while the plan is paid up. "non_renewing" (cancelled but
 * paid to the end of the month) and "attention" (a renewal charge failed and
 * Paystack is retrying) keep access until the period ends.
 */
export function isPro(sub: Subscription, now = Date.now()): boolean {
  if (sub.plan !== 'pro') return false
  if (!['active', 'non_renewing', 'attention'].includes(sub.status)) return false
  if (!sub.currentPeriodEnd) return true
  return Date.parse(sub.currentPeriodEnd) > now
}

/** A few days' grace after each billing date so renewals that land late don't lock users out. */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000

export function periodEndFrom(date: string | Date, addMonth: boolean): string {
  const d = new Date(date)
  if (addMonth) d.setUTCMonth(d.getUTCMonth() + 1)
  return new Date(d.getTime() + GRACE_MS).toISOString()
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface SubscriptionUpdate {
  plan?: Plan
  status?: SubStatus
  currentPeriodEnd?: string | null
  customerCode?: string
  subscriptionCode?: string
  emailToken?: string
}

export interface BillingStore {
  getSubscription(userId: string): Promise<Subscription>
  /** Registrable domains this user has scan history for (each counts as one website). */
  listScannedDomains(userId: string): Promise<string[]>
  updateSubscription(userId: string, update: SubscriptionUpdate): Promise<void>
  findUserByCustomer(customerCode: string): Promise<string | null>
  /** Records a webhook event; returns false if it was already processed. */
  recordEvent(id: string, event: string, userId: string | null, payload: unknown): Promise<boolean>
  forgetEvent(id: string): Promise<void>
}

export class SupabaseBillingStore implements BillingStore {
  constructor(private db: SupabaseClient) {}

  async getSubscription(userId: string): Promise<Subscription> {
    const { data, error } = await this.db
      .from('subscriptions')
      .select('plan,status,current_period_end,paystack_customer_code,paystack_subscription_code,paystack_email_token')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw new Error(`getSubscription: ${error.message}`)
    if (!data) return FREE_SUBSCRIPTION
    return {
      plan: data.plan,
      status: data.status,
      currentPeriodEnd: data.current_period_end,
      customerCode: data.paystack_customer_code,
      subscriptionCode: data.paystack_subscription_code,
      emailToken: data.paystack_email_token,
    }
  }

  async listScannedDomains(userId: string): Promise<string[]> {
    const { data, error } = await this.db.from('scans').select('domain').eq('user_id', userId).limit(MAX_SCANS_PER_USER + 100)
    if (error) throw new Error(`listScannedDomains: ${error.message}`)
    return [...new Set((data ?? []).map((r) => String(r.domain)))]
  }

  async updateSubscription(userId: string, u: SubscriptionUpdate) {
    const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() }
    if (u.plan !== undefined) row.plan = u.plan
    if (u.status !== undefined) row.status = u.status
    if (u.currentPeriodEnd !== undefined) row.current_period_end = u.currentPeriodEnd
    if (u.customerCode !== undefined) row.paystack_customer_code = u.customerCode
    if (u.subscriptionCode !== undefined) row.paystack_subscription_code = u.subscriptionCode
    if (u.emailToken !== undefined) row.paystack_email_token = u.emailToken
    const { error } = await this.db.from('subscriptions').upsert(row, { onConflict: 'user_id' })
    if (error) throw new Error(`updateSubscription: ${error.message}`)
  }

  async findUserByCustomer(customerCode: string) {
    const { data, error } = await this.db
      .from('subscriptions')
      .select('user_id')
      .eq('paystack_customer_code', customerCode)
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`findUserByCustomer: ${error.message}`)
    return data ? String(data.user_id) : null
  }

  async recordEvent(id: string, event: string, userId: string | null, payload: unknown) {
    const { error } = await this.db.from('billing_events').insert({ id, event, user_id: userId, payload })
    if (!error) return true
    if (error.code === '23505') return false // duplicate: already processed
    throw new Error(`recordEvent: ${error.message}`)
  }

  async forgetEvent(id: string) {
    await this.db.from('billing_events').delete().eq('id', id)
  }
}

export function defaultBillingStore(): BillingStore | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null
  const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return new SupabaseBillingStore(db)
}

// ---------------------------------------------------------------------------
// Paystack API (fixed host, server-side secret key)
// ---------------------------------------------------------------------------

export interface PaystackTransaction {
  status: string
  reference: string
  amount: number
  currency: string
  paid_at?: string | null
  metadata?: unknown
  customer?: { id?: number; customer_code?: string; email?: string }
  plan?: unknown
  plan_object?: { plan_code?: string }
}

export interface PaystackSubscription {
  subscription_code: string
  email_token: string
  status: string
  next_payment_date?: string | null
  plan?: { plan_code?: string }
}

export interface PaystackApi {
  initialize(input: { email: string; userId: string }): Promise<{ authorizationUrl: string; reference: string }>
  verify(reference: string): Promise<PaystackTransaction>
  listSubscriptions(customerId: number): Promise<PaystackSubscription[]>
  manageLink(subscriptionCode: string): Promise<string>
}

export class PaystackError extends Error {}

const PAYSTACK_BASE = 'https://api.paystack.co'

export function createPaystack(secretKey: string, planCode: string, fetchImpl: typeof fetch = fetch): PaystackApi {
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${PAYSTACK_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    })
    const json = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null
    if (!res.ok || !json?.status) {
      throw new PaystackError(`Paystack ${method} ${path.split('?')[0]} failed (${res.status}): ${json?.message ?? 'no message'}`)
    }
    return json.data as T
  }

  return {
    async initialize({ email, userId }) {
      const data = await call<{ authorization_url: string; reference: string }>('POST', '/transaction/initialize', {
        email,
        amount: config.PRO_PRICE_KOBO,
        currency: 'NGN',
        plan: planCode,
        callback_url: `${config.APP_URL}/billing`,
        metadata: { user_id: userId },
      })
      if (!data.authorization_url?.startsWith('https://checkout.paystack.com/')) {
        throw new PaystackError('Unexpected checkout URL from Paystack')
      }
      return { authorizationUrl: data.authorization_url, reference: data.reference }
    },
    verify: (reference) => call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`),
    async listSubscriptions(customerId) {
      return call<PaystackSubscription[]>('GET', `/subscription?customer=${encodeURIComponent(String(customerId))}&perPage=20`)
    },
    async manageLink(subscriptionCode) {
      const data = await call<{ link: string }>('GET', `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`)
      if (!data.link?.startsWith('https://')) throw new PaystackError('Unexpected manage link from Paystack')
      return data.link
    },
  }
}

export function defaultPaystack(): PaystackApi | null {
  if (!config.PAYSTACK_SECRET_KEY || !config.PAYSTACK_PLAN_CODE) return null
  return createPaystack(config.PAYSTACK_SECRET_KEY, config.PAYSTACK_PLAN_CODE)
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/** Paystack signs the raw request body with HMAC-SHA512 using the secret key. */
export function isValidPaystackSignature(rawBody: Buffer, signature: string | undefined, secretKey: string): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false
  const expected = createHmac('sha512', secretKey).update(rawBody).digest()
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Stable id for idempotency: Paystack retries deliver identical bodies. */
export const eventId = (rawBody: Buffer) => createHash('sha256').update(rawBody).digest('hex')

export function metadataUserId(metadata: unknown): string | null {
  let m = metadata
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m)
    } catch {
      return null
    }
  }
  if (m && typeof m === 'object' && 'user_id' in m && typeof (m as { user_id: unknown }).user_id === 'string') {
    return (m as { user_id: string }).user_id
  }
  return null
}

export function planCodeOf(tx: { plan?: unknown; plan_object?: { plan_code?: string } }): string | null {
  if (tx.plan_object?.plan_code) return tx.plan_object.plan_code
  if (typeof tx.plan === 'string') return tx.plan
  if (tx.plan && typeof tx.plan === 'object' && 'plan_code' in tx.plan) return String((tx.plan as { plan_code: unknown }).plan_code)
  return null
}
