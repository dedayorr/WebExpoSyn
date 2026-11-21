/**
 * Minimal DNS-over-HTTPS client (JSON API) used for record types Node's
 * resolver doesn't expose, such as DS for DNSSEC. Only talks to fixed,
 * trusted public resolvers, never to user-supplied hosts.
 */
export interface DohAnswer {
  name: string
  type: number
  TTL: number
  data: string
}

export interface DohResponse {
  Status: number
  /** Authenticated Data: the resolver validated DNSSEC for this answer. */
  AD: boolean
  Answer?: DohAnswer[]
}

/** Tried in order; the second is a fallback for networks that block or drop the first. */
export const DOH_ENDPOINTS = ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']

export type DohFetch = (url: string, init: RequestInit) => Promise<Response>

export async function dohQuery(
  name: string,
  type: string,
  timeoutMs = 5_000,
  fetchImpl: DohFetch = fetch,
): Promise<DohResponse> {
  let lastError: unknown
  for (const endpoint of DOH_ENDPOINTS) {
    const url = `${endpoint}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}&do=1`
    try {
      const res = await fetchImpl(url, {
        headers: { accept: 'application/dns-json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`DoH HTTP ${res.status}`)
      return (await res.json()) as DohResponse
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}
