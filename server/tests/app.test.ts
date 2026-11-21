import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp, type AppDeps } from '../src/app.js'
import type { TokenVerifier } from '../src/middleware/auth.js'
import { runScan } from '../src/services/scan.js'
import type { Finding } from '../src/types.js'

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }]

const stub = (module: Finding['module'], status: Finding['status'], severity: Finding['severity'] = 'none'): Finding => ({
  id: `${module}.${status}`,
  title: `${module} ${status}`,
  module,
  status,
  severity,
  confidence: 'high',
  found: '',
  why: '',
  action: '',
  evidence: '',
})

/** Scan with network-free module runners. */
const fakeScan: NonNullable<AppDeps['scan']> = (url, opts) =>
  runScan(url, {
    ...opts,
    lookupAll: publicLookup,
    verifyOwnership: async () => false,
    runners: {
      tls: async () => [stub('tls', 'pass')],
      headers: async () => [stub('headers', 'fail', 'medium'), stub('exposure', 'warn', 'low')],
      dns: async () => [stub('dns', 'unverified', 'info')],
      email: async () => {
        throw new Error('resolver down')
      },
      exposure: async () => [],
    },
  })

const TOKEN = 'header.payload.signature'
const fakeVerifier: TokenVerifier = async (token) => {
  if (token !== TOKEN) throw new Error('bad token')
  return { id: 'user-1', email: 'dayo@example.com' }
}

/** App with auth on (fake verifier) and generous limits unless overridden. */
const makeApp = (deps: AppDeps = {}) =>
  createApp({ scan: fakeScan, verifier: fakeVerifier, targetScansPerWindow: 100, ...deps })

const authed = (req: request.Test) => req.set('Authorization', `Bearer ${TOKEN}`)

describe('API', () => {
  it('GET /api/health', async () => {
    const res = await request(makeApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  describe('authentication', () => {
    it('requires a token to scan', async () => {
      const res = await request(makeApp()).post('/api/scans').send({ url: 'shop.com' })
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    })

    it('rejects an invalid token with a generic message', async () => {
      const res = await request(makeApp()).post('/api/scans').set('Authorization', 'Bearer forged.token.value').send({ url: 'shop.com' })
      expect(res.status).toBe(401)
      expect(res.body.error.message).not.toMatch(/bad token/)
    })

    it('rejects malformed Authorization headers', async () => {
      const res = await request(makeApp()).post('/api/scans').set('Authorization', `Basic ${TOKEN}`).send({ url: 'shop.com' })
      expect(res.status).toBe(401)
    })

    it('protects the verification endpoints too', async () => {
      expect((await request(makeApp()).get('/api/verification/shop.com')).status).toBe(401)
      expect((await request(makeApp()).post('/api/verification/check').send({ domain: 'shop.com' })).status).toBe(401)
    })
  })

  it('rejects an empty body with 400', async () => {
    const res = await authed(request(makeApp()).post('/api/scans')).send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('rejects internal targets with 422 before any network call', async () => {
    let called = false
    const app = makeApp({
      scan: async (u, o) => {
        called = true
        return fakeScan(u, o)
      },
    })
    const res = await authed(request(app).post('/api/scans')).send({ url: 'http://localhost:8080' })
    expect(res.status).toBe(422)
    expect(called).toBe(false)
  })

  it('rejects bad DKIM selectors', async () => {
    const res = await authed(request(makeApp()).post('/api/scans')).send({ url: 'shop.com', dkimSelectors: ['../etc'] })
    expect(res.status).toBe(400)
  })

  it('returns a structured report and turns module failures into "unverified"', async () => {
    const res = await authed(request(makeApp()).post('/api/scans')).send({ url: 'https://www.shop.com' })
    expect(res.status).toBe(200)
    const report = res.body
    expect(report.target.domain).toBe('shop.com')
    expect(report.summary).toMatchObject({ pass: 1, fail: 1, warn: 1 })
    const email = report.modules.find((m: { id: string }) => m.id === 'email')
    expect(email.error).toContain('resolver down')
    expect(report.findings[0].status).toBe('fail')
    expect(report.findings.some((f: Finding) => f.id === 'email.module-error' && f.status === 'unverified')).toBe(true)
  })

  it('returns 503 when the scanner is at capacity', async () => {
    let release!: () => void
    const blocked = new Promise<void>((r) => (release = r))
    const app = makeApp({
      maxConcurrentScans: 1,
      scan: async (url, opts) => {
        await blocked
        return fakeScan(url, opts)
      },
    })
    const first = authed(request(app).post('/api/scans')).send({ url: 'shop.com' }).then((r) => r)
    await new Promise((r) => setTimeout(r, 50))
    const second = await authed(request(app).post('/api/scans')).send({ url: 'other.com' })
    expect(second.status).toBe(503)
    release()
    expect((await first).status).toBe(200)
  })

  it('times out slow scans with 504 but keeps the slot until the work really ends', async () => {
    let release!: () => void
    const blocked = new Promise<void>((r) => (release = r))
    const app = makeApp({
      maxConcurrentScans: 1,
      scanTimeoutMs: 50,
      scan: async (url, opts) => {
        await blocked
        return fakeScan(url, opts)
      },
    })
    const slow = await authed(request(app).post('/api/scans')).send({ url: 'shop.com' })
    expect(slow.status).toBe(504)
    // background work still running → still at capacity
    expect((await authed(request(app).post('/api/scans')).send({ url: 'other.com' })).status).toBe(503)
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect((await authed(request(app).post('/api/scans')).send({ url: 'third.com' })).status).not.toBe(503)
  })

  it('rate-limits scans per user', async () => {
    const app = makeApp({ scanRateLimit: 2 })
    await authed(request(app).post('/api/scans')).send({ url: 'a.com' })
    await authed(request(app).post('/api/scans')).send({ url: 'b.com' })
    const third = await authed(request(app).post('/api/scans')).send({ url: 'c.com' })
    expect(third.status).toBe(429)
    expect(third.body.error.code).toBe('RATE_LIMITED')
  })

  it('limits how often the same target can be scanned by anyone', async () => {
    const app = makeApp({ targetScansPerWindow: 2 })
    expect((await authed(request(app).post('/api/scans')).send({ url: 'victim.com' })).status).toBe(200)
    expect((await authed(request(app).post('/api/scans')).send({ url: 'https://victim.com/x' })).status).toBe(200)
    const third = await authed(request(app).post('/api/scans')).send({ url: 'victim.com' })
    expect(third.status).toBe(429)
    expect(third.body.error.code).toBe('TARGET_COOLDOWN')
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0)
    // other targets are unaffected
    expect((await authed(request(app).post('/api/scans')).send({ url: 'other.com' })).status).toBe(200)
  })

  it('returns verification instructions for a domain', async () => {
    const res = await authed(request(makeApp()).get('/api/verification/www.shop.com'))
    expect(res.status).toBe(200)
    expect(res.body.domain).toBe('shop.com')
    expect(res.body.record).toMatch(/^webexposyn-verify=[0-9a-f]{32}$/)
  })

  it('never leaks internals on unexpected errors', async () => {
    const app = makeApp({
      scan: async () => {
        throw new Error('secret internal detail')
      },
    })
    const res = await authed(request(app).post('/api/scans')).send({ url: 'shop.com' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail')
  })

  it('rejects oversized bodies', async () => {
    const res = await authed(request(makeApp()).post('/api/scans')).send({ url: 'a.com', pad: 'x'.repeat(20_000) })
    expect(res.status).toBe(400)
  })
})
