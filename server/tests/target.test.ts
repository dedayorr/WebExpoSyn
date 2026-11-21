import { describe, expect, it } from 'vitest'
import { isPublicIp } from '../src/lib/ip.js'
import { parseTarget, validateTarget, TargetValidationError, type LookupAll } from '../src/lib/target.js'

const resolvesTo =
  (...addresses: string[]): LookupAll =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))

async function rejectCode(input: string, lookup: LookupAll) {
  try {
    await validateTarget(input, lookup)
  } catch (err) {
    expect(err).toBeInstanceOf(TargetValidationError)
    return (err as TargetValidationError).code
  }
  throw new Error(`expected ${input} to be rejected`)
}

describe('isPublicIp', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.4.1',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1', // carrier-grade NAT
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '192.0.2.10', // documentation
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1', // IPv4-mapped loopback
    '::ffff:10.0.0.1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false)
  })

  it.each(['93.184.216.34', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (ip) => {
    expect(isPublicIp(ip)).toBe(true)
  })
})

describe('parseTarget', () => {
  it('adds https:// and finds the registrable domain', () => {
    const t = parseTarget('www.Example.co.uk/shop?x=1')
    expect(t.url.protocol).toBe('https:')
    expect(t.hostname).toBe('www.example.co.uk')
    expect(t.domain).toBe('example.co.uk')
    expect(t.port).toBe(443)
  })

  it('punycode-encodes internationalised domains', () => {
    expect(parseTarget('https://bücher.de').hostname).toBe('xn--bcher-kva.de')
  })

  it.each([
    ['ftp://example.com', 'UNSUPPORTED_PROTOCOL'],
    ['file:///etc/passwd', 'UNSUPPORTED_PROTOCOL'],
    ['javascript:alert(1)', 'INVALID_URL'],
    ['https://user:pass@example.com', 'CREDENTIALS_NOT_ALLOWED'],
    ['https://example.com:8080', 'PORT_NOT_ALLOWED'],
    ['http://example.com:22', 'PORT_NOT_ALLOWED'],
    ['http://127.0.0.1', 'IP_LITERAL_NOT_ALLOWED'],
    ['http://[::1]/', 'IP_LITERAL_NOT_ALLOWED'],
    ['http://2130706433', 'IP_LITERAL_NOT_ALLOWED'], // decimal 127.0.0.1
    ['http://0x7f000001', 'IP_LITERAL_NOT_ALLOWED'], // hex 127.0.0.1
    ['http://localhost', 'INTERNAL_HOSTNAME'],
    ['http://intranet', 'INTERNAL_HOSTNAME'],
    ['http://printer.local', 'INTERNAL_HOSTNAME'],
    ['http://db.internal', 'INTERNAL_HOSTNAME'],
    ['   ', 'INVALID_URL'],
  ])('rejects %s', (input, code) => {
    try {
      parseTarget(input)
      throw new Error('expected rejection')
    } catch (err) {
      expect(err).toBeInstanceOf(TargetValidationError)
      expect((err as TargetValidationError).code).toBe(code)
    }
  })
})

describe('validateTarget', () => {
  it('accepts a domain that resolves only to public addresses', async () => {
    const t = await validateTarget('example.com', resolvesTo('93.184.216.34', '2606:2800:220:1::1'))
    expect(t.addresses).toHaveLength(2)
  })

  it('rejects a domain pointing at a private address (DNS rebinding / internal pivot)', async () => {
    expect(await rejectCode('evil.example', resolvesTo('10.0.0.1'))).toBe('PRIVATE_ADDRESS')
  })

  it('rejects when ANY resolved address is private', async () => {
    expect(await rejectCode('mixed.example.com', resolvesTo('93.184.216.34', '169.254.169.254'))).toBe('PRIVATE_ADDRESS')
  })

  it('reports DNS failures clearly', async () => {
    const failing: LookupAll = async () => {
      throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' })
    }
    expect(await rejectCode('missing.example.com', failing)).toBe('DNS_RESOLUTION_FAILED')
  })
})
