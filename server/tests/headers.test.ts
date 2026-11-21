import { describe, expect, it } from 'vitest'
import { analyzeHeaders } from '../src/checks/headers.js'

const byId = (findings: ReturnType<typeof analyzeHeaders>) => Object.fromEntries(findings.map((f) => [f.id, f]))

describe('analyzeHeaders', () => {
  it('flags missing security headers', () => {
    const r = byId(analyzeHeaders({ server: 'nginx/1.18.0', 'x-powered-by': 'PHP/7.4' }, { isHttps: true, url: 'https://a.com/' }))
    expect(r['headers.csp'].status).toBe('fail')
    expect(r['headers.hsts'].status).toBe('fail')
    expect(r['headers.xcto'].status).toBe('fail')
    expect(r['headers.framing'].status).toBe('fail')
    expect(r['headers.referrer'].status).toBe('warn')
    expect(r['headers.permissions'].status).toBe('warn')
    expect(r['exposure.server-info'].status).toBe('warn')
    expect(r['exposure.server-info'].module).toBe('exposure')
  })

  it('passes a well-configured site', () => {
    const r = byId(
      analyzeHeaders(
        {
          'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=()',
          server: 'cloudflare',
        },
        { isHttps: true, url: 'https://a.com/' },
      ),
    )
    for (const f of Object.values(r)) expect(f.status, f.id).toBe('pass')
  })

  it('accepts CSP frame-ancestors instead of X-Frame-Options', () => {
    const r = byId(analyzeHeaders({ 'content-security-policy': "frame-ancestors 'self'" }, { isHttps: true, url: 'https://a.com/' }))
    expect(r['headers.framing'].status).toBe('pass')
  })

  it('warns on unsafe CSP script sources', () => {
    const r = byId(analyzeHeaders({ 'content-security-policy': "script-src 'self' 'unsafe-inline' 'unsafe-eval'" }, { isHttps: true, url: 'https://a.com/' }))
    expect(r['headers.csp'].status).toBe('warn')
    expect(r['headers.csp'].found).toContain("'unsafe-eval'")
  })

  it('does not penalise unsafe-inline when a nonce is used', () => {
    const r = byId(analyzeHeaders({ 'content-security-policy': "script-src 'nonce-abc' 'unsafe-inline'" }, { isHttps: true, url: 'https://a.com/' }))
    expect(r['headers.csp'].status).toBe('pass')
  })

  it('warns on a short HSTS max-age', () => {
    const r = byId(analyzeHeaders({ 'strict-transport-security': 'max-age=300' }, { isHttps: true, url: 'https://a.com/' }))
    expect(r['headers.hsts'].status).toBe('warn')
  })

  it('skips HSTS on plain HTTP', () => {
    const r = byId(analyzeHeaders({}, { isHttps: false, url: 'http://a.com/' }))
    expect(r['headers.hsts']).toBeUndefined()
  })
})
