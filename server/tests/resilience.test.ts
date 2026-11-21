import { describe, expect, it } from 'vitest'
import { runDnsChecks } from '../src/checks/dns.js'
import { dohQuery } from '../src/lib/doh.js'
import { errorMessage } from '../src/lib/finding.js'
import type { DnsClient } from '../src/lib/dnsClient.js'

describe('errorMessage', () => {
  it('turns AbortSignal timeouts into readable text, not "23"', () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    expect(errorMessage(timeout)).toBe('timed out')
  })
  it('uses the errno code from fetch failures', () => {
    expect(errorMessage(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }))).toBe('ENOTFOUND')
  })
  it('uses Node errno codes', () => {
    expect(errorMessage(Object.assign(new Error('x'), { code: 'ETIMEOUT' }))).toBe('ETIMEOUT')
  })
})

describe('dohQuery', () => {
  it('falls back to the second resolver when the first fails', async () => {
    const calls: string[] = []
    const fakeFetch = async (url: string) => {
      calls.push(url)
      if (url.includes('cloudflare')) throw new DOMException('timeout', 'TimeoutError')
      return new Response(JSON.stringify({ Status: 0, AD: true, Answer: [] }), { status: 200 })
    }
    const res = await dohQuery('example.com', 'DS', 1000, fakeFetch)
    expect(res.AD).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('dns.google')
  })
})

describe('nameserver consistency', () => {
  it('retries a second address before calling a nameserver unresponsive', async () => {
    const base = {
      resolve4: async (n: string) => (n.startsWith('ns') ? ['1.1.1.1', '8.8.8.8'] : ['93.184.216.34']),
      resolve6: async () => [],
      resolveMx: async () => [],
      resolveNs: async () => ['ns1.example.net', 'ns2.example.net'],
      resolveCaa: async () => [],
      resolveCname: async () => Promise.reject(Object.assign(new Error(), { code: 'ENODATA' })),
      resolveTxt: async () => [],
      resolveSoa: async () => ({ serial: 1 }),
    } as unknown as DnsClient
    let firstAttempt = true
    const clientFor = (ip: string) =>
      ({
        resolveSoa: async () => {
          if (ip === '1.1.1.1' && firstAttempt) {
            firstAttempt = false
            throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })
          }
          return { serial: 42 }
        },
      }) as unknown as DnsClient
    const doh = async () => ({ Status: 0, AD: false })
    const findings = await runDnsChecks('example.com', 'example.com', { client: base, clientFor, doh })
    expect(findings.find((f) => f.id === 'dns.consistency')?.status).toBe('pass')
  })
})
