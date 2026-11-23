/**
 * Why a domain has no DNS records: expired, never registered, suspended, or
 * registered with no website. Uses RDAP, the registries' official replacement
 * for WHOIS. Registry servers come from IANA's bootstrap list, never from user
 * input, so these requests can't be pointed at arbitrary hosts.
 */

export type DomainStatus =
  | { state: 'unregistered' }
  | { state: 'expired'; expiredOn?: string; detail: 'past_expiry' | 'redemption' | 'pending_delete' }
  | { state: 'on_hold'; expiresOn?: string }
  | { state: 'active'; expiresOn?: string }
  | { state: 'unknown' }

type Fetch = typeof fetch

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json'
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000
const TIMEOUT_MS = 6_000

let bootstrap: { at: number; servers: Map<string, string> } | null = null

async function rdapServerFor(tld: string, fetchImpl: Fetch): Promise<string | null> {
  if (!bootstrap || Date.now() - bootstrap.at > BOOTSTRAP_TTL_MS) {
    const res = await fetchImpl(BOOTSTRAP_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' })
    if (!res.ok) throw new Error(`bootstrap ${res.status}`)
    const json = (await res.json()) as { services?: [string[], string[]][] }
    const servers = new Map<string, string>()
    for (const [tlds, urls] of json.services ?? []) {
      const https = urls.find((u) => u.startsWith('https://'))
      if (!https) continue
      for (const t of tlds) servers.set(t.toLowerCase(), https.endsWith('/') ? https : `${https}/`)
    }
    bootstrap = { at: Date.now(), servers }
  }
  return bootstrap.servers.get(tld) ?? null
}

/** For tests. */
export function resetRdapCache() {
  bootstrap = null
}

const has = (statuses: string[], s: string) => statuses.some((x) => x.toLowerCase() === s)

export async function lookupDomainStatus(domain: string, fetchImpl: Fetch = fetch, now = Date.now()): Promise<DomainStatus> {
  try {
    const tld = domain.toLowerCase().split('.').pop() ?? ''
    const server = await rdapServerFor(tld, fetchImpl)
    if (!server) return { state: 'unknown' } // e.g. registries without RDAP

    const res = await fetchImpl(`${server}domain/${encodeURIComponent(domain.toLowerCase())}`, {
      headers: { accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    })
    if (res.status === 404) return { state: 'unregistered' }
    if (!res.ok) return { state: 'unknown' }

    const data = (await res.json()) as { status?: string[]; events?: { eventAction?: string; eventDate?: string }[] }
    const statuses = data.status ?? []
    const expiry = data.events?.find((e) => e.eventAction === 'expiration')?.eventDate
    const expiryMs = expiry ? Date.parse(expiry) : NaN

    if (has(statuses, 'pending delete')) return { state: 'expired', expiredOn: expiry, detail: 'pending_delete' }
    if (has(statuses, 'redemption period')) return { state: 'expired', expiredOn: expiry, detail: 'redemption' }
    if (Number.isFinite(expiryMs) && expiryMs < now) return { state: 'expired', expiredOn: expiry, detail: 'past_expiry' }
    if (has(statuses, 'client hold') || has(statuses, 'server hold') || has(statuses, 'inactive')) {
      return { state: 'on_hold', expiresOn: expiry }
    }
    return { state: 'active', expiresOn: expiry }
  } catch {
    return { state: 'unknown' }
  }
}

const day = (iso?: string) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

/** A plain-English explanation and error code for the user. */
export function explainMissingDomain(hostname: string, domain: string, status: DomainStatus): { code: string; message: string } {
  switch (status.state) {
    case 'expired': {
      const on = day(status.expiredOn)
      const when = on ? ` on ${on}` : ''
      const next =
        status.detail === 'pending_delete'
          ? 'It is about to be released, so anyone may soon be able to register it.'
          : 'The owner can usually still renew it with their domain registrar.'
      return { code: 'DOMAIN_EXPIRED', message: `${domain} expired${when}, so it no longer points to a website. ${next}` }
    }
    case 'unregistered':
      return {
        code: 'DOMAIN_NOT_REGISTERED',
        message: `${domain} is not registered to anyone. Check the spelling; if it is yours, it may have expired and been released.`,
      }
    case 'on_hold':
      return {
        code: 'DOMAIN_ON_HOLD',
        message: `${domain} is registered but suspended by its registrar (often after a missed renewal or a billing issue), so it has no website right now.`,
      }
    case 'active':
      return {
        code: 'NO_WEBSITE',
        message:
          hostname === domain
            ? `${domain} is registered, but it doesn't point to a website yet (no address records in DNS).`
            : `${domain} is registered, but ${hostname} doesn't point to a website. Try ${domain} or check the address.`,
      }
    default:
      return {
        code: 'DOMAIN_NOT_FOUND',
        message: `We could not find ${hostname} in DNS. Check the spelling, or whether the domain has expired.`,
      }
  }
}
