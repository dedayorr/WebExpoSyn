/**
 * Minimal DNS-over-HTTPS client (JSON API) used for record types Node's
 * resolver doesn't expose, such as DS for DNSSEC. Only talks to a fixed,
 * trusted resolver, never to user-supplied hosts.
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

const DOH_ENDPOINT = 'https://cloudflare-dns.com/dns-query'

export async function dohQuery(name: string, type: string, timeoutMs = 5_000): Promise<DohResponse> {
  const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}&do=1`
  const res = await fetch(url, {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`DoH HTTP ${res.status}`)
  return (await res.json()) as DohResponse
}
