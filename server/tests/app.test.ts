import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp, type AppDeps } from '../src/app.js'
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

describe('API', () => {
  it('GET /api/health', async () => {
    const res = await request(createApp()).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('rejects an empty body with 400', async () => {
    const res = await request(createApp({ scan: fakeScan })).post('/api/scans').send({})
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('rejects internal targets with 422 before any network call', async () => {
    const res = await request(createApp()).post('/api/scans').send({ url: 'http://localhost:8080' })
    expect(res.status).toBe(422)
    expect(['PORT_NOT_ALLOWED', 'INTERNAL_HOSTNAME']).toContain(res.body.error.code)
  })

  it('rejects bad DKIM selectors', async () => {
    const res = await request(createApp({ scan: fakeScan })).post('/api/scans').send({ url: 'shop.com', dkimSelectors: ['../etc'] })
    expect(res.status).toBe(400)
  })

  it('returns a structured report and turns module failures into "unverified"', async () => {
    const res = await request(createApp({ scan: fakeScan })).post('/api/scans').send({ url: 'https://www.shop.com' })
    expect(res.status).toBe(200)
    const report = res.body
    expect(report.target.domain).toBe('shop.com')
    expect(report.summary).toMatchObject({ pass: 1, fail: 1, warn: 1 })
    const email = report.modules.find((m: { id: string }) => m.id === 'email')
    expect(email.error).toContain('resolver down')
    expect(report.findings[0].status).toBe('fail') // failures sorted first
    expect(report.findings.some((f: Finding) => f.id === 'email.module-error' && f.status === 'unverified')).toBe(true)
  })

  it('returns 503 when the scanner is at capacity', async () => {
    let release!: () => void
    const blocked = new Promise<void>((r) => (release = r))
    const app = createApp({
      maxConcurrentScans: 1,
      scan: async (url, opts) => {
        await blocked
        return fakeScan(url, opts)
      },
    })
    const first = request(app).post('/api/scans').send({ url: 'shop.com' }).then((r) => r)
    await new Promise((r) => setTimeout(r, 50))
    const second = await request(app).post('/api/scans').send({ url: 'shop.com' })
    expect(second.status).toBe(503)
    release()
    expect((await first).status).toBe(200)
  })

  it('rate-limits scans', async () => {
    const app = createApp({ scan: fakeScan, scanRateLimit: 2 })
    await request(app).post('/api/scans').send({ url: 'shop.com' })
    await request(app).post('/api/scans').send({ url: 'shop.com' })
    const third = await request(app).post('/api/scans').send({ url: 'shop.com' })
    expect(third.status).toBe(429)
  })

  it('returns verification instructions for a domain', async () => {
    const res = await request(createApp()).get('/api/verification/www.shop.com')
    expect(res.status).toBe(200)
    expect(res.body.domain).toBe('shop.com')
    expect(res.body.record).toMatch(/^webexposyn-verify=[0-9a-f]{32}$/)
  })

  it('never leaks internals on unexpected errors', async () => {
    const app = createApp({
      scan: async () => {
        throw new Error('secret internal detail')
      },
    })
    const res = await request(app).post('/api/scans').send({ url: 'shop.com' })
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('secret internal detail')
  })
})
