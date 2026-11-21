import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { USER_AGENT } from '../config.js'
import { defaultLookupAll, parseTarget, resolvePublicAddresses, type LookupAll } from './target.js'

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD'
  /** Max redirects to follow; each hop is re-validated. */
  maxRedirects?: number
  /** Per-request timeout. */
  timeoutMs?: number
  /** Stop reading the body after this many bytes. */
  maxBytes?: number
  /**
   * Skip certificate validation. Only used to read headers from a site whose
   * certificate is broken (the TLS module reports that problem separately).
   */
  insecureTls?: boolean
  lookupAll?: LookupAll
}

export interface SafeResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
  truncated: boolean
  finalUrl: string
  redirects: { url: string; status: number }[]
  remoteAddress?: string
}

export class SafeFetchError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SafeFetchError'
  }
}

/**
 * HTTP client hardened against SSRF:
 * - every URL (including redirect targets) passes parseTarget()
 * - hostnames are resolved once, checked for public addresses, and the socket
 *   is pinned to that address (defeats DNS rebinding between check and use)
 * - redirects are followed manually, up to a small limit
 * - strict timeouts and response-size limits
 * - responses are only read as text; nothing is ever executed
 */
export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const {
    method = 'GET',
    maxRedirects = 5,
    timeoutMs = 8_000,
    maxBytes = 256 * 1024,
    insecureTls = false,
    lookupAll = defaultLookupAll,
  } = opts

  const redirects: { url: string; status: number }[] = []
  let current = input

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const target = parseTarget(current)
    const [pinned] = await resolvePublicAddresses(target.hostname, lookupAll)
    const res = await requestOnce(target.url, pinned, { method, timeoutMs, maxBytes, insecureTls })

    const location = res.headers.location
    if (res.status >= 300 && res.status < 400 && location) {
      redirects.push({ url: target.url.toString(), status: res.status })
      current = new URL(location, target.url).toString()
      continue
    }
    return { ...res, finalUrl: target.url.toString(), redirects }
  }
  throw new SafeFetchError('TOO_MANY_REDIRECTS', `Stopped after ${maxRedirects} redirects.`)
}

function requestOnce(
  url: URL,
  pinned: { address: string; family: 4 | 6 },
  opts: { method: string; timeoutMs: number; maxBytes: number; insecureTls: boolean },
): Promise<Omit<SafeResponse, 'finalUrl' | 'redirects'>> {
  // Force the socket to the address we already validated.
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options && (options as { all?: boolean }).all) {
      ;(callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [pinned])
    } else {
      callback(null, pinned.address, pinned.family)
    }
  }

  const isHttps = url.protocol === 'https:'
  const client = isHttps ? https : http

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: opts.method,
        lookup,
        timeout: opts.timeoutMs,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'accept-encoding': 'identity',
        },
        ...(isHttps ? { servername: url.hostname, rejectUnauthorized: !opts.insecureTls } : {}),
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        let truncated = false
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > opts.maxBytes) {
            truncated = true
            chunks.push(chunk.subarray(0, Math.max(0, opts.maxBytes - (size - chunk.length))))
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        const done = () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            truncated,
            remoteAddress: res.socket?.remoteAddress ?? pinned.address,
          })
        res.on('end', done)
        res.on('close', done)
        res.on('error', (err) => (truncated ? done() : reject(err)))
      },
    )
    // Hard deadline in addition to the idle socket timeout.
    const deadline = setTimeout(() => req.destroy(new SafeFetchError('TIMEOUT', 'The site took too long to respond.')), opts.timeoutMs)
    req.on('timeout', () => req.destroy(new SafeFetchError('TIMEOUT', 'The site took too long to respond.')))
    req.on('error', (err) => {
      clearTimeout(deadline)
      reject(err)
    })
    req.on('close', () => clearTimeout(deadline))
    req.end()
  })
}
