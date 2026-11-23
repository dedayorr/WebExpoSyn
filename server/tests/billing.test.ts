import { createHmac } from 'node:crypto'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp, type AppDeps } from '../src/createApp.js'
import type { TokenVerifier } from '../src/middleware/auth.js'
import {
  FREE_SUBSCRIPTION,
  createPaystack,
  isPro,
  isValidPaystackSignature,
  type BillingStore,
  type PaystackApi,
  type PaystackTransaction,
  type Subscription,
} from '../src/services/billing.js'
import { runScan } from '../src/services/scan.js'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'
const TOKEN = 'header.payload.signature'
const SECRET = 'sk_test_abc123'
const PLAN = 'PLN_pro123'
const future = () => new Date(Date.now() + 20 * 86400_000).toISOString()

const verifier: TokenVerifier = async (t) => {
  if (t !== TOKEN) throw new Error('bad')
  return { id: USER, email: 'dayo@example.com' }
}

const fakeScan: NonNullable<AppDeps['scan']> = (url, opts) =>
  runScan(url, {
    ...opts,
    lookupAll: async () => [{ address: '93.184.216.34', family: 4 }],
    verifyOwnership: async () => false,
    runners: { tls: async () => [], headers: async () => [], dns: async () => [], email: async () => [], exposure: async () => [] },
  })

function memoryBilling(init: { sub?: Partial<Subscription>; domains?: string[]; fail?: boolean } = {}) {
  const subs = new Map<string, Subscription>()
  if (init.sub) subs.set(USER, { ...FREE_SUBSCRIPTION, ...init.sub })
  const domains = new Map<string, string[]>([[USER, init.domains ?? []]])
  const events = new Set<string>()
  const store: BillingStore = {
    async getSubscription(id) {
      if (init.fail) throw new Error('db down')
      return subs.get(id) ?? FREE_SUBSCRIPTION
    },
    async listScannedDomains(id) {
      if (init.fail) throw new Error('db down')
      return domains.get(id) ?? []
    },
    async updateSubscription(id, u) {
      const cur = subs.get(id) ?? FREE_SUBSCRIPTION
      subs.set(id, {
        plan: u.plan ?? cur.plan,
        status: u.status ?? cur.status,
        currentPeriodEnd: u.currentPeriodEnd !== undefined ? u.currentPeriodEnd : cur.currentPeriodEnd,
        customerCode: u.customerCode ?? cur.customerCode,
        subscriptionCode: u.subscriptionCode ?? cur.subscriptionCode,
        emailToken: u.emailToken ?? cur.emailToken,
      })
    },
    async findUserByCustomer(code) {
      for (const [id, s] of subs) if (s.customerCode === code) return id
      return null
    },
    async recordEvent(id) {
      if (events.has(id)) return false
      events.add(id)
      return true
    },
    async forgetEvent(id) {
      events.delete(id)
    },
  }
  return { store, subs, domains }
}

const paidTx = (over: Partial<PaystackTransaction> = {}): PaystackTransaction => ({
  status: 'success',
  reference: 'ref_1',
  amount: 500_000,
  currency: 'NGN',
  paid_at: new Date().toISOString(),
  metadata: { user_id: USER },
  customer: { id: 42, customer_code: 'CUS_1' },
  plan_object: { plan_code: PLAN },
  ...over,
})

function fakePaystack(tx: PaystackTransaction = paidTx()): PaystackApi & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    async initialize({ email, userId }) {
      calls.push(`init:${email}:${userId}`)
      return { authorizationUrl: 'https://checkout.paystack.com/abc', reference: 'ref_1' }
    },
    async verify(ref) {
      calls.push(`verify:${ref}`)
      return tx
    },
    async listSubscriptions() {
      return [{ subscription_code: 'SUB_1', email_token: 'tok', status: 'active', plan: { plan_code: PLAN } }]
    },
    async manageLink(code) {
      return `https://paystack.com/manage/${code}`
    },
  }
}

const makeApp = (deps: AppDeps = {}) =>
  createApp({
    scan: fakeScan,
    verifier,
    store: null,
    targetScansPerWindow: 100,
    paystackSecretKey: SECRET,
    paystackPlanCode: PLAN,
    freeSiteLimit: 3,
    ...deps,
  })

const authed = (r: request.Test) => r.set('Authorization', `Bearer ${TOKEN}`)
const sign = (body: string) => createHmac('sha512', SECRET).update(body).digest('hex')
const webhook = (app: ReturnType<typeof makeApp>, payload: unknown, signature?: string) => {
  const body = JSON.stringify(payload)
  return request(app)
    .post('/api/billing/webhook')
    .set('Content-Type', 'application/json')
    .set('x-paystack-signature', signature ?? sign(body))
    .send(body)
}

describe('isPro', () => {
  it('requires a paid, current pro plan', () => {
    expect(isPro(FREE_SUBSCRIPTION)).toBe(false)
    expect(isPro({ ...FREE_SUBSCRIPTION, plan: 'pro', status: 'active', currentPeriodEnd: future() })).toBe(true)
    expect(isPro({ ...FREE_SUBSCRIPTION, plan: 'pro', status: 'non_renewing', currentPeriodEnd: future() })).toBe(true)
    expect(isPro({ ...FREE_SUBSCRIPTION, plan: 'pro', status: 'active', currentPeriodEnd: '2020-01-01T00:00:00Z' })).toBe(false)
    expect(isPro({ ...FREE_SUBSCRIPTION, plan: 'pro', status: 'cancelled', currentPeriodEnd: future() })).toBe(false)
  })
})

describe('free plan website limit', () => {
  it('allows scanning up to 3 websites', async () => {
    const { store } = memoryBilling({ domains: ['a.com', 'b.com'] })
    const res = await authed(request(makeApp({ billing: store })).post('/api/scans')).send({ url: 'c.com' })
    expect(res.status).toBe(200)
  })

  it('blocks a 4th website with 402', async () => {
    const { store } = memoryBilling({ domains: ['a.com', 'b.com', 'c.com'] })
    const res = await authed(request(makeApp({ billing: store })).post('/api/scans')).send({ url: 'd.com' })
    expect(res.status).toBe(402)
    expect(res.body.error.code).toBe('PLAN_LIMIT')
  })

  it('always allows rescanning a website already in history, including subdomains', async () => {
    const { store } = memoryBilling({ domains: ['a.com', 'b.com', 'c.com'] })
    const app = makeApp({ billing: store })
    expect((await authed(request(app).post('/api/scans')).send({ url: 'a.com' })).status).toBe(200)
    expect((await authed(request(app).post('/api/scans')).send({ url: 'https://www.b.com' })).status).toBe(200)
  })

  it('lets Pro users scan any number of websites', async () => {
    const { store } = memoryBilling({ domains: ['a.com', 'b.com', 'c.com'], sub: { plan: 'pro', status: 'active', currentPeriodEnd: future() } })
    const res = await authed(request(makeApp({ billing: store })).post('/api/scans')).send({ url: 'd.com' })
    expect(res.status).toBe(200)
  })

  it('applies the limit again when Pro has expired', async () => {
    const { store } = memoryBilling({ domains: ['a.com', 'b.com', 'c.com'], sub: { plan: 'pro', status: 'active', currentPeriodEnd: '2020-01-01T00:00:00Z' } })
    const res = await authed(request(makeApp({ billing: store })).post('/api/scans')).send({ url: 'd.com' })
    expect(res.status).toBe(402)
  })

  it('fails closed when the plan cannot be read', async () => {
    const { store } = memoryBilling({ fail: true })
    const res = await authed(request(makeApp({ billing: store })).post('/api/scans')).send({ url: 'a.com' })
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('PLAN_CHECK_FAILED')
  })

  it('counts websites being scanned in parallel', async () => {
    const { store } = memoryBilling({ domains: ['a.com', 'b.com'] })
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const slowScan: NonNullable<AppDeps['scan']> = async (url, opts) => {
      await gate
      return fakeScan(url, opts)
    }
    const app = makeApp({ billing: store, scan: slowScan })
    const first = authed(request(app).post('/api/scans')).send({ url: 'c.com' }).then((r) => r)
    await new Promise((r) => setTimeout(r, 50))
    const second = await authed(request(app).post('/api/scans')).send({ url: 'd.com' })
    expect(second.status).toBe(402)
    release()
    expect((await first).status).toBe(200)
  })
})

describe('GET /api/billing', () => {
  it('reports plan and usage', async () => {
    const { store } = memoryBilling({ domains: ['a.com'] })
    const res = await authed(request(makeApp({ billing: store, paystack: fakePaystack() })).get('/api/billing'))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ plan: 'free', sitesUsed: 1, siteLimit: 3, billingEnabled: true, priceKobo: 500_000 })
  })

  it('requires sign-in', async () => {
    const res = await request(makeApp({ billing: memoryBilling().store })).get('/api/billing')
    expect(res.status).toBe(401)
  })
})

describe('checkout and verification', () => {
  it('starts a checkout bound to the signed-in user', async () => {
    const paystack = fakePaystack()
    const res = await authed(request(makeApp({ billing: memoryBilling().store, paystack })).post('/api/billing/checkout'))
    expect(res.status).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/checkout\.paystack\.com\//)
    expect(paystack.calls).toContain(`init:dayo@example.com:${USER}`)
  })

  it('returns 503 when Paystack is not configured', async () => {
    const res = await authed(request(makeApp({ billing: memoryBilling().store, paystack: null })).post('/api/billing/checkout'))
    expect(res.status).toBe(503)
  })

  it('upgrades after a verified payment', async () => {
    const billing = memoryBilling()
    const res = await authed(request(makeApp({ billing: billing.store, paystack: fakePaystack() })).post('/api/billing/verify')).send({ reference: 'ref_1' })
    expect(res.status).toBe(200)
    expect(res.body.plan).toBe('pro')
    expect(billing.subs.get(USER)).toMatchObject({ customerCode: 'CUS_1', subscriptionCode: 'SUB_1' })
  })

  it("refuses someone else's payment reference", async () => {
    const billing = memoryBilling()
    const paystack = fakePaystack(paidTx({ metadata: { user_id: OTHER } }))
    const res = await authed(request(makeApp({ billing: billing.store, paystack })).post('/api/billing/verify')).send({ reference: 'ref_1' })
    expect(res.status).toBe(403)
    expect(billing.subs.get(USER)).toBeUndefined()
  })

  it('refuses failed, underpaid or wrong-plan payments', async () => {
    for (const tx of [paidTx({ status: 'failed' }), paidTx({ amount: 100 }), paidTx({ currency: 'USD' }), paidTx({ plan_object: { plan_code: 'PLN_other' } })]) {
      const billing = memoryBilling()
      const res = await authed(request(makeApp({ billing: billing.store, paystack: fakePaystack(tx) })).post('/api/billing/verify')).send({ reference: 'ref_1' })
      expect(res.status).toBe(402)
      expect(billing.subs.get(USER)).toBeUndefined()
    }
  })

  it('does not reactivate Pro from an old, expired payment', async () => {
    const billing = memoryBilling()
    const paystack = fakePaystack(paidTx({ paid_at: '2024-01-01T00:00:00Z' }))
    const res = await authed(request(makeApp({ billing: billing.store, paystack })).post('/api/billing/verify')).send({ reference: 'ref_1' })
    expect(res.body.plan).toBe('free')
  })

  it('rejects malformed references', async () => {
    const res = await authed(request(makeApp({ billing: memoryBilling().store, paystack: fakePaystack() })).post('/api/billing/verify')).send({ reference: '../../x' })
    expect(res.status).toBe(400)
  })
})

describe('webhook', () => {
  it('rejects bad or missing signatures', async () => {
    const billing = memoryBilling()
    const app = makeApp({ billing: billing.store })
    expect((await webhook(app, { event: 'charge.success', data: paidTx() }, 'a'.repeat(128))).status).toBe(401)
    expect((await webhook(app, { event: 'charge.success', data: paidTx() }, 'nope')).status).toBe(401)
    expect(billing.subs.get(USER)).toBeUndefined()
  })

  it('activates Pro on charge.success for our plan', async () => {
    const billing = memoryBilling()
    const res = await webhook(makeApp({ billing: billing.store }), { event: 'charge.success', data: { ...paidTx(), plan: PLAN } })
    expect(res.status).toBe(200)
    expect(isPro(billing.subs.get(USER)!)).toBe(true)
  })

  it('ignores one-off charges that are not for the Pro plan', async () => {
    const billing = memoryBilling()
    await webhook(makeApp({ billing: billing.store }), { event: 'charge.success', data: { ...paidTx(), plan_object: {} } })
    expect(billing.subs.get(USER)).toBeUndefined()
  })

  it('handles the subscription lifecycle and duplicate deliveries', async () => {
    const billing = memoryBilling({ sub: { plan: 'pro', status: 'active', currentPeriodEnd: future(), customerCode: 'CUS_1' } })
    const app = makeApp({ billing: billing.store })
    const create = { event: 'subscription.create', data: { subscription_code: 'SUB_9', email_token: 't', plan: { plan_code: PLAN }, customer: { customer_code: 'CUS_1' }, next_payment_date: future() } }
    await webhook(app, create)
    expect(billing.subs.get(USER)!.subscriptionCode).toBe('SUB_9')

    await webhook(app, { event: 'subscription.not_renew', data: { subscription_code: 'SUB_9', customer: { customer_code: 'CUS_1' } } })
    expect(billing.subs.get(USER)!.status).toBe('non_renewing')
    expect(isPro(billing.subs.get(USER)!)).toBe(true)

    const disable = { event: 'subscription.disable', data: { subscription_code: 'SUB_9', customer: { customer_code: 'CUS_1' } } }
    await webhook(app, disable)
    expect(isPro(billing.subs.get(USER)!)).toBe(false)

    // A replayed create must not resurrect the subscription.
    const dup = await webhook(app, create)
    expect(dup.body.duplicate).toBe(true)
    expect(isPro(billing.subs.get(USER)!)).toBe(false)
  })

  it("ignores events for a different subscription", async () => {
    const billing = memoryBilling({ sub: { plan: 'pro', status: 'active', currentPeriodEnd: future(), customerCode: 'CUS_1', subscriptionCode: 'SUB_1' } })
    await webhook(makeApp({ billing: billing.store }), { event: 'subscription.disable', data: { subscription_code: 'SUB_other', customer: { customer_code: 'CUS_1' } } })
    expect(isPro(billing.subs.get(USER)!)).toBe(true)
  })
})

describe('signature and client helpers', () => {
  it('validates HMAC-SHA512 signatures', () => {
    const body = Buffer.from('{"a":1}')
    expect(isValidPaystackSignature(body, sign('{"a":1}'), SECRET)).toBe(true)
    expect(isValidPaystackSignature(body, sign('{"a":2}'), SECRET)).toBe(false)
    expect(isValidPaystackSignature(body, undefined, SECRET)).toBe(false)
  })

  it('Paystack client sends the secret key only to api.paystack.co and rejects odd checkout URLs', async () => {
    const seen: string[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push(`${url} ${(init.headers as Record<string, string>).Authorization}`)
      return new Response(JSON.stringify({ status: true, data: { authorization_url: 'https://evil.example/pay', reference: 'r' } }), { status: 200 })
    }) as unknown as typeof fetch
    const client = createPaystack(SECRET, PLAN, fetchImpl)
    await expect(client.initialize({ email: 'a@b.co', userId: USER })).rejects.toThrow(/checkout URL/)
    expect(seen[0]).toBe(`https://api.paystack.co/transaction/initialize Bearer ${SECRET}`)
  })
})
