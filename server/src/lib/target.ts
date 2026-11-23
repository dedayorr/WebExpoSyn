import dns from 'node:dns'
import { withRetry } from './retry.js'
import { getDomain } from 'tldts'
import { isIpLiteral, isPublicIp } from './ip.js'

export type TargetErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_PROTOCOL'
  | 'CREDENTIALS_NOT_ALLOWED'
  | 'PORT_NOT_ALLOWED'
  | 'IP_LITERAL_NOT_ALLOWED'
  | 'INTERNAL_HOSTNAME'
  | 'NOT_A_PUBLIC_DOMAIN'
  | 'DNS_RESOLUTION_FAILED'
  | 'DOMAIN_NOT_FOUND'
  | 'DOMAIN_EXPIRED'
  | 'DOMAIN_NOT_REGISTERED'
  | 'DOMAIN_ON_HOLD'
  | 'NO_WEBSITE'
  | 'PRIVATE_ADDRESS'

export class TargetValidationError extends Error {
  constructor(
    public code: TargetErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'TargetValidationError'
  }
}

export interface ParsedTarget {
  url: URL
  hostname: string
  /** Registrable domain (eTLD+1), e.g. "example.co.uk" for "www.example.co.uk". */
  domain: string
  port: number
}

export interface ResolvedTarget extends ParsedTarget {
  /** Public addresses the hostname resolved to. Requests are pinned to these. */
  addresses: { address: string; family: 4 | 6 }[]
}

/** Resolver signature, injectable for tests. */
export type LookupAll = (hostname: string) => Promise<{ address: string; family: number }[]>

const LOOKUP_TIMEOUT_MS = 5_000

/** System resolver lookup with a hard timeout (getaddrinfo itself has none). */
export const defaultLookupAll: LookupAll = (hostname) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error('DNS lookup timed out'), { code: 'ETIMEOUT' })),
      LOOKUP_TIMEOUT_MS,
    )
    dns.promises.lookup(hostname, { all: true, verbatim: true }).then(
      (r) => {
        clearTimeout(timer)
        resolve(r)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })

const ALLOWED_PORTS = new Set([80, 443])
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.localdomain']

/**
 * Step 1 of the scan workflow: syntactic validation.
 * Accepts "example.com", "https://example.com/path" etc. Only http/https on
 * ports 80/443, no credentials, no IP literals, no internal hostnames.
 */
export function parseTarget(input: string): ParsedTarget {
  const raw = input.trim()
  if (!raw || raw.length > 2048) throw new TargetValidationError('INVALID_URL', 'Enter a website address.')

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new TargetValidationError('INVALID_URL', 'That does not look like a valid website address.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TargetValidationError('UNSUPPORTED_PROTOCOL', 'Only http:// and https:// addresses can be scanned.')
  }
  if (url.username || url.password) {
    throw new TargetValidationError('CREDENTIALS_NOT_ALLOWED', 'Remove the username or password from the address.')
  }

  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  if (!ALLOWED_PORTS.has(port)) {
    throw new TargetValidationError('PORT_NOT_ALLOWED', 'Only the standard web ports (80 and 443) can be scanned.')
  }

  // URL already lower-cases and punycode-encodes the hostname.
  const hostname = url.hostname.replace(/\.$/, '')

  if (isIpLiteral(hostname)) {
    throw new TargetValidationError('IP_LITERAL_NOT_ALLOWED', 'Enter a domain name rather than an IP address.')
  }
  if (
    hostname === 'localhost' ||
    !hostname.includes('.') ||
    INTERNAL_SUFFIXES.some((s) => hostname.endsWith(s))
  ) {
    throw new TargetValidationError('INTERNAL_HOSTNAME', 'Internal or local hostnames cannot be scanned.')
  }

  const domain = getDomain(hostname, { allowPrivateDomains: false })
  if (!domain) {
    throw new TargetValidationError('NOT_A_PUBLIC_DOMAIN', 'That is not a public internet domain.')
  }

  url.hostname = hostname
  url.hash = ''
  return { url, hostname, domain, port }
}

/**
 * Resolve a hostname and require EVERY address to be public. Rejecting when
 * any address is private stops split-horizon tricks where one record points
 * inside the network.
 */
/** Answers that mean the name really has no address records. */
const NOT_FOUND = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN', 'ENONAME'])
const errCode = (e: unknown) => String((e as { code?: unknown })?.code ?? '')

export async function resolvePublicAddresses(
  hostname: string,
  lookupAll: LookupAll = defaultLookupAll,
): Promise<{ address: string; family: 4 | 6 }[]> {
  let results: { address: string; family: number }[]
  try {
    results = await withRetry(() => lookupAll(hostname), { shouldRetry: (e) => !NOT_FOUND.has(errCode(e)) })
  } catch (err) {
    if (NOT_FOUND.has(errCode(err))) {
      throw new TargetValidationError(
        'DOMAIN_NOT_FOUND',
        `We could not find ${hostname} in DNS. Check the spelling, or that the domain is registered and has a website.`,
      )
    }
    // Timeouts and resolver hiccups: the domain may be fine.
    throw new TargetValidationError(
      'DNS_RESOLUTION_FAILED',
      `We couldn't look up ${hostname} just now (${errCode(err) || 'lookup failed'}). Please try again in a minute.`,
    )
  }
  if (results.length === 0) {
    throw new TargetValidationError('DOMAIN_NOT_FOUND', `We could not find ${hostname} in DNS.`)
  }
  const blocked = results.find((r) => !isPublicIp(r.address))
  if (blocked) {
    throw new TargetValidationError(
      'PRIVATE_ADDRESS',
      `${hostname} resolves to a private or reserved address, which cannot be scanned.`,
    )
  }
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }))
}

/** Step 2: full validation (syntax + DNS + address safety). */
export async function validateTarget(input: string, lookupAll: LookupAll = defaultLookupAll): Promise<ResolvedTarget> {
  const parsed = parseTarget(input)
  const addresses = await resolvePublicAddresses(parsed.hostname, lookupAll)
  return { ...parsed, addresses }
}

/** Validate a bare domain (used by the verification endpoints). */
export function parseDomain(input: string): string {
  return parseTarget(input).domain
}
