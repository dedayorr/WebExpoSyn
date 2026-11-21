import { errorMessage, makeFinding } from '../lib/finding.js'
import { safeFetch } from '../lib/safeFetch.js'
import type { ResolvedTarget } from '../lib/target.js'
import type { Finding } from '../types.js'
import { analyzeHeaders } from './headers.js'

/** Fetches the target page (following safe redirects) and analyses its headers. */
export async function runHeaderChecks(target: ResolvedTarget): Promise<Finding[]> {
  const start = `https://${target.hostname}${target.url.pathname}${target.url.search}`
  try {
    let res
    try {
      res = await safeFetch(start, { maxBytes: 64 * 1024 })
    } catch {
      // Broken certificates are reported by the TLS module; still read headers.
      res = await safeFetch(start, { maxBytes: 64 * 1024, insecureTls: true })
    }
    return analyzeHeaders(res.headers, { isHttps: res.finalUrl.startsWith('https://'), url: res.finalUrl })
  } catch (err) {
    return [
      makeFinding('headers')({
        id: 'headers.fetch',
        title: 'Security headers could not be checked',
        status: 'unverified',
        found: 'The website did not return a response we could analyse.',
        why: 'Without a response we cannot see which security headers are set.',
        action: 'Make sure the site is reachable over HTTPS, then rescan.',
        evidence: `GET ${start} → ${errorMessage(err)}`,
      }),
    ]
  }
}
