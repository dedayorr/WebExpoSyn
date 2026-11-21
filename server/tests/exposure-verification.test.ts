import { describe, expect, it } from 'vitest'
import { runExposureChecks, type Fetcher } from '../src/checks/exposure.js'
import type { ResolvedTarget } from '../src/lib/target.js'
import { isOwnershipVerified, verificationToken } from '../src/services/verification.js'
import { fakeDns } from './fakeDns.js'

const target = {
  url: new URL('https://shop.com/'),
  hostname: 'shop.com',
  domain: 'shop.com',
  port: 443,
  addresses: [{ address: '93.184.216.34', family: 4 }],
} as ResolvedTarget

const response = (status: number, body = '') => ({ status, headers: {}, body, truncated: false, finalUrl: '', redirects: [] })

describe('runExposureChecks', () => {
  it('does nothing until ownership is verified', async () => {
    let calls = 0
    const fetcher: Fetcher = async () => {
      calls++
      return response(200)
    }
    const out = await runExposureChecks(target, { ownershipVerified: false, fetcher, delayMs: 0 })
    expect(calls).toBe(0)
    expect(out[0].status).toBe('unverified')
  })

  it('detects an exposed .git directory by content, not status code', async () => {
    const fetcher: Fetcher = async (url) => {
      if (url.endsWith('/.git/HEAD')) return response(200, 'ref: refs/heads/main\n')
      return response(404)
    }
    const out = await runExposureChecks(target, { ownershipVerified: true, fetcher, delayMs: 0 })
    const git = out.find((f) => f.id.includes('git'))
    expect(git?.status).toBe('fail')
    expect(git?.severity).toBe('critical')
  })

  it('ignores "soft 404" pages that return 200 for everything', async () => {
    const fetcher: Fetcher = async () => response(200, '<html><title>Not found</title></html>')
    const out = await runExposureChecks(target, { ownershipVerified: true, fetcher, delayMs: 0 })
    expect(out.find((f) => f.id === 'exposure.files')?.status).toBe('pass')
    expect(out.find((f) => f.id === 'exposure.listing')?.status).toBe('pass')
  })

  it('detects directory listings', async () => {
    const fetcher: Fetcher = async (url) =>
      url.endsWith('/uploads/') ? response(200, '<html><title>Index of /uploads</title>') : response(404)
    const out = await runExposureChecks(target, { ownershipVerified: true, fetcher, delayMs: 0 })
    expect(out.find((f) => f.id === 'exposure.listing')?.status).toBe('fail')
  })
})

describe('ownership verification', () => {
  const secret = 'test-secret-1234567890'

  it('derives a stable token per domain', () => {
    expect(verificationToken('shop.com', secret)).toBe(verificationToken('SHOP.com', secret))
    expect(verificationToken('shop.com', secret)).not.toBe(verificationToken('other.com', secret))
  })

  it('verifies when the TXT record is on the root or _webexposyn host', async () => {
    const token = verificationToken('shop.com', secret)
    expect(await isOwnershipVerified('shop.com', fakeDns({ txt: { 'shop.com': [token] } }), secret)).toBe(true)
    expect(await isOwnershipVerified('shop.com', fakeDns({ txt: { '_webexposyn.shop.com': [token] } }), secret)).toBe(true)
    expect(await isOwnershipVerified('shop.com', fakeDns({ txt: { 'shop.com': ['webexposyn-verify=wrong'] } }), secret)).toBe(false)
  })
})

describe('exposure evidence redaction', () => {
  it('never copies secret values from an exposed .env into the report', async () => {
    const secretEnv = 'DB_PASSWORD=SuperSecretValue123\nSTRIPE_KEY=sk_live_abcdefghijklmnop\n'
    const fetcher: Fetcher = async (url) => (url.endsWith('/.env') ? response(200, secretEnv) : response(404))
    const out = await runExposureChecks(target, { ownershipVerified: true, fetcher, delayMs: 0 })
    const env = out.find((f) => f.id.includes('env'))!
    expect(env.status).toBe('fail')
    expect(env.evidence).toContain('DB_PASSWORD')
    expect(env.evidence).not.toContain('SuperSecret')
    expect(env.evidence).not.toContain('sk_live')
  })
})
