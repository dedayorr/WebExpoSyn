import { describe, expect, it } from 'vitest'
import { countSpfLookups, parseDmarc, parseSpf, runEmailChecks } from '../src/checks/email.js'
import { fakeDns } from './fakeDns.js'

const byId = (findings: Awaited<ReturnType<typeof runEmailChecks>>) => Object.fromEntries(findings.map((f) => [f.id, f]))

describe('parseSpf', () => {
  it('reads mechanisms, qualifiers and redirect', () => {
    const spf = parseSpf('v=spf1 ip4:1.2.3.4 include:_spf.google.com ~all')
    expect(spf.all).toBe('~')
    expect(spf.terms.map((t) => t.mechanism)).toEqual(['ip4', 'include', 'all'])
    expect(parseSpf('v=spf1 redirect=_spf.example.com').redirect).toBe('_spf.example.com')
  })
})

describe('parseDmarc', () => {
  it('reads tags', () => {
    expect(parseDmarc('v=DMARC1; p=reject; rua=mailto:a@b.com; pct=50')).toMatchObject({ p: 'reject', pct: '50', rua: 'mailto:a@b.com' })
  })
})

describe('countSpfLookups', () => {
  it('counts nested includes and survives loops', async () => {
    const dns = fakeDns({
      txt: {
        'a.com': ['v=spf1 include:b.com include:c.com mx -all'],
        'b.com': ['v=spf1 include:a.com a -all'], // loop back to a.com
        'c.com': ['v=spf1 ip4:1.1.1.1 -all'],
      },
    })
    const { count } = await countSpfLookups('a.com', dns)
    // a.com: include b, include c, mx = 3; b.com: include a, a = 2; c.com: 0
    expect(count).toBe(5)
  })
})

describe('runEmailChecks', () => {
  it('flags missing SPF and DMARC on a domain that receives mail', async () => {
    const r = byId(await runEmailChecks('shop.com', { client: fakeDns({ mx: { 'shop.com': [{ exchange: 'mx.shop.com', priority: 10 }] } }) }))
    expect(r['email.spf'].status).toBe('fail')
    expect(r['email.spf'].severity).toBe('high')
    expect(r['email.dmarc'].status).toBe('fail')
    expect(r['email.dkim'].status).toBe('unverified')
  })

  it('flags p=none and +all', async () => {
    const r = byId(
      await runEmailChecks('shop.com', {
        client: fakeDns({ txt: { 'shop.com': ['v=spf1 +all'], '_dmarc.shop.com': ['v=DMARC1; p=none'] } }),
      }),
    )
    expect(r['email.spf'].title).toMatch(/\+all/)
    expect(r['email.dmarc'].title).toMatch(/p=none/)
    expect(r['email.dmarc-reports'].status).toBe('warn')
  })

  it('passes a well-configured domain and finds DKIM by supplied selector', async () => {
    const r = byId(
      await runEmailChecks('shop.com', {
        dkimSelectors: ['mail2024'],
        client: fakeDns({
          txt: {
            'shop.com': ['v=spf1 include:_spf.mail.com -all'],
            '_spf.mail.com': ['v=spf1 ip4:1.2.3.0/24 -all'],
            '_dmarc.shop.com': ['v=DMARC1; p=reject; rua=mailto:d@shop.com'],
            'mail2024._domainkey.shop.com': ['v=DKIM1; k=rsa; p=MIIBIjANBgkq'],
          },
        }),
      }),
    )
    expect(r['email.spf'].status).toBe('pass')
    expect(r['email.spf-lookups'].status).toBe('pass')
    expect(r['email.dmarc'].status).toBe('pass')
    expect(r['email.dkim'].status).toBe('pass')
  })

  it('fails when a supplied DKIM selector is missing', async () => {
    const r = byId(await runEmailChecks('shop.com', { dkimSelectors: ['nope'], client: fakeDns({}) }))
    expect(r['email.dkim'].status).toBe('fail')
  })

  it('flags multiple SPF records', async () => {
    const r = byId(await runEmailChecks('shop.com', { client: fakeDns({ txt: { 'shop.com': ['v=spf1 -all', 'v=spf1 ~all'] } }) }))
    expect(r['email.spf'].title).toBe('Multiple SPF records')
  })
})

describe('SPF lookup budget', () => {
  it('stops walking a hostile include tree after a small, fixed number of queries', async () => {
    let queries = 0
    // Every domain includes 20 more domains: unbounded fan-out if not capped.
    const hostile = {
      resolveTxt: async (name: string) => {
        queries++
        return [[`v=spf1 ${Array.from({ length: 20 }, (_, i) => `include:${i}.${name}`).join(' ')} -all`]]
      },
      resolveMx: async () => [],
    } as unknown as import('../src/lib/dnsClient.js').DnsClient
    const result = await countSpfLookups('evil.com', hostile)
    expect(result.stopped).toBe(true)
    expect(result.count).toBeGreaterThan(10)
    expect(queries).toBeLessThanOrEqual(12)
  })
})
