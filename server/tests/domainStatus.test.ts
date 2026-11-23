import { beforeEach, describe, expect, it } from 'vitest'
import { explainMissingDomain, lookupDomainStatus, resetRdapCache } from '../src/lib/domainStatus.js'

const NOW = Date.parse('2026-11-23T00:00:00Z')
const bootstrap = { services: [[['com'], ['https://rdap.verisign.com/com/v1/']]] }

function fakeFetch(domainResponse: { status: number; body?: unknown }, seen: string[] = []) {
  return (async (url: string) => {
    seen.push(String(url))
    if (String(url).startsWith('https://data.iana.org/')) return new Response(JSON.stringify(bootstrap), { status: 200 })
    return new Response(domainResponse.body ? JSON.stringify(domainResponse.body) : '', { status: domainResponse.status })
  }) as unknown as typeof fetch
}

describe('domain status (RDAP)', () => {
  beforeEach(() => resetRdapCache())

  it('detects a domain whose expiry date has passed', async () => {
    const seen: string[] = []
    const s = await lookupDomainStatus(
      'sotab.com',
      fakeFetch({ status: 200, body: { status: ['active'], events: [{ eventAction: 'expiration', eventDate: '2026-10-01T00:00:00Z' }] } }, seen),
      NOW,
    )
    expect(s).toMatchObject({ state: 'expired', detail: 'past_expiry' })
    expect(seen[1]).toBe('https://rdap.verisign.com/com/v1/domain/sotab.com')
  })

  it('detects redemption and pending delete', async () => {
    expect(await lookupDomainStatus('a.com', fakeFetch({ status: 200, body: { status: ['redemption period'] } }), NOW)).toMatchObject({ state: 'expired', detail: 'redemption' })
    resetRdapCache()
    expect(await lookupDomainStatus('a.com', fakeFetch({ status: 200, body: { status: ['pending delete'] } }), NOW)).toMatchObject({ detail: 'pending_delete' })
  })

  it('reports unregistered, on hold and active domains', async () => {
    expect(await lookupDomainStatus('free.com', fakeFetch({ status: 404 }), NOW)).toEqual({ state: 'unregistered' })
    resetRdapCache()
    expect(await lookupDomainStatus('held.com', fakeFetch({ status: 200, body: { status: ['client hold'] } }), NOW)).toMatchObject({ state: 'on_hold' })
    resetRdapCache()
    expect(
      await lookupDomainStatus('ok.com', fakeFetch({ status: 200, body: { status: ['active'], events: [{ eventAction: 'expiration', eventDate: '2027-05-01T00:00:00Z' }] } }), NOW),
    ).toMatchObject({ state: 'active' })
  })

  it('returns unknown for TLDs without RDAP or on errors', async () => {
    expect(await lookupDomainStatus('site.ng', fakeFetch({ status: 200 }), NOW)).toEqual({ state: 'unknown' })
    resetRdapCache()
    const broken = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    expect(await lookupDomainStatus('x.com', broken, NOW)).toEqual({ state: 'unknown' })
  })

  it('writes clear messages', () => {
    const e = explainMissingDomain('sotab.com', 'sotab.com', { state: 'expired', expiredOn: '2026-10-01T00:00:00Z', detail: 'past_expiry' })
    expect(e.code).toBe('DOMAIN_EXPIRED')
    expect(e.message).toMatch(/expired on 1 October 2026/)
    expect(explainMissingDomain('www.ok.com', 'ok.com', { state: 'active' }).message).toMatch(/www\.ok\.com does not point/)
  })
})
