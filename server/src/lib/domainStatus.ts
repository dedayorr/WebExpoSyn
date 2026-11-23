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

export interface DomainExplanation {
  code: string
  message: string
  /** What this means and what to do, as short sentences. */
  advice: string[]
}

const RECHECK = 'Once it is fixed, run a new scan to check the website’s security.'

/** A plain-English explanation, what to do next, and an error code for the user. */
export function explainMissingDomain(hostname: string, domain: string, status: DomainStatus): DomainExplanation {
  switch (status.state) {
    case 'expired': {
      const on = day(status.expiredOn)
      const when = on ? ` on ${on}` : ''
      if (status.detail === 'pending_delete') {
        return {
          code: 'DOMAIN_EXPIRED',
          message: `This domain has expired. ${domain} expired${when} and is about to be deleted by the registry, so it can no longer be renewed.`,
          advice: [
            'The website and every email address on this domain have stopped working.',
            'Within days, anyone will be able to register it, including someone who could use it to impersonate the business or receive emails meant for it.',
            'To get it back, register it the moment it becomes available. A backorder service from your registrar can try to catch it for you.',
            'Update anywhere the old address appears: social profiles, business cards, email signatures and online listings.',
          ],
        }
      }
      return {
        code: 'DOMAIN_EXPIRED',
        message: `This domain has expired. ${domain} expired${when}, so it no longer points to a website.`,
        advice: [
          'The website and every email address on this domain have stopped working.',
          status.detail === 'redemption'
            ? 'It is in its recovery (redemption) period: the owner can still get it back from the registrar where it was bought, usually for an extra fee. Act quickly; after this period it is deleted.'
            : 'The owner can usually still renew it at the registrar where it was bought (for example Whogohost, Namecheap or GoDaddy). Log in there and renew it as soon as possible.',
          'If it is not renewed, it will be released and anyone could register it and pose as the business.',
          'After renewing, it can take up to 48 hours for the website and email to work again.',
          'Turn on auto-renew and keep the registrar contact email up to date so it does not lapse again.',
          RECHECK,
        ],
      }
    }
    case 'unregistered':
      return {
        code: 'DOMAIN_NOT_REGISTERED',
        message: `${domain} is not registered to anyone.`,
        advice: [
          'Check the spelling of the address.',
          'If this domain used to belong to you or your business, it has expired and been released. You can register it again if it is still free.',
          'While it is unregistered, anyone can buy it, so register it quickly if you still need it.',
        ],
      }
    case 'on_hold':
      return {
        code: 'DOMAIN_ON_HOLD',
        message: `${domain} is registered but suspended by its registrar, so it has no website right now.`,
        advice: [
          'Suspensions usually follow a missed renewal payment, an unanswered verification email, or a complaint.',
          'Check the inbox of the email address used to register the domain for a message from the registrar, and follow its instructions.',
          'If you cannot find one, contact the registrar’s support and ask why the domain is on hold.',
          status.expiresOn ? `The registration itself runs until ${day(status.expiresOn) ?? status.expiresOn}.` : RECHECK,
        ].filter(Boolean),
      }
    case 'active':
      return {
        code: 'NO_WEBSITE',
        message:
          hostname === domain
            ? `${domain} is registered, but it does not point to a website yet.`
            : `${domain} is registered, but ${hostname} does not point to a website.`,
        advice: [
          hostname === domain
            ? 'The domain has no address (A, AAAA or CNAME) records in its DNS settings.'
            : `Try scanning ${domain} instead, or add a record for ${hostname} in your DNS settings.`,
          'If you have a website, add the records your hosting provider gives you at your DNS provider or registrar.',
          status.expiresOn ? `The domain is registered until ${day(status.expiresOn) ?? status.expiresOn}.` : RECHECK,
        ],
      }
    default:
      return {
        code: 'DOMAIN_NOT_FOUND',
        message: `We could not find ${hostname} in DNS.`,
        advice: [
          'Check the spelling of the address.',
          'The domain may have expired: the owner can check with the registrar where it was bought.',
          'If the domain is new or its settings were just changed, wait up to 48 hours and try again.',
        ],
      }
  }
}
