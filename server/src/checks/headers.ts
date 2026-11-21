import type { IncomingHttpHeaders } from 'node:http'
import { evidence, makeFinding } from '../lib/finding.js'
import type { Finding } from '../types.js'

const f = makeFinding('headers')
const exposure = makeFinding('exposure')

const HSTS_MIN_MAX_AGE = 15_552_000 // 180 days

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const v = headers[name.toLowerCase()]
  if (Array.isArray(v)) return v.join(', ')
  return v ?? undefined
}

function directive(policy: string, name: string): string | undefined {
  return policy
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith(`${name} `) || d.toLowerCase() === name)
}

/**
 * Module 2: HTTP security header analysis. Pure function over response
 * headers so it is easy to unit test. Also covers passive server
 * information disclosure (Module 5) since it only needs the same headers.
 */
export function analyzeHeaders(headers: IncomingHttpHeaders, opts: { isHttps: boolean; url: string }): Finding[] {
  const out: Finding[] = []
  const where = `GET ${opts.url}`

  // Content-Security-Policy
  const csp = header(headers, 'content-security-policy')
  const cspReportOnly = header(headers, 'content-security-policy-report-only')
  if (!csp) {
    out.push(
      f({
        id: 'headers.csp',
        title: cspReportOnly ? 'Content-Security-Policy only in report-only mode' : 'Content-Security-Policy missing',
        status: 'fail',
        severity: 'medium',
        found: cspReportOnly
          ? 'A report-only policy is set, so the browser reports violations but does not block anything.'
          : "The website's HTTP response did not include a Content-Security-Policy header.",
        why: 'A well-configured CSP restricts where the browser loads scripts and other resources from, reducing the impact of injection attacks such as cross-site scripting.',
        action: cspReportOnly
          ? 'Review the violation reports, then switch the header to Content-Security-Policy to enforce it.'
          : 'Define and test a Content Security Policy for the website, starting in report-only mode.',
        evidence: evidence(where, cspReportOnly ? `content-security-policy-report-only: ${cspReportOnly}` : '(no content-security-policy header)'),
      }),
    )
  } else {
    const scriptSrc = directive(csp, 'script-src') ?? directive(csp, 'default-src') ?? ''
    const weak: string[] = []
    if (/'unsafe-inline'/.test(scriptSrc) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc)) weak.push("'unsafe-inline'")
    if (/'unsafe-eval'/.test(scriptSrc)) weak.push("'unsafe-eval'")
    if (/(^|\s)(\*|https?:|data:)(\s|$)/.test(scriptSrc)) weak.push('a wildcard or scheme-wide source')
    out.push(
      weak.length
        ? f({
            id: 'headers.csp',
            title: 'Content-Security-Policy allows unsafe script sources',
            status: 'warn',
            severity: 'low',
            confidence: 'medium',
            found: `The policy is present but its script sources include ${weak.join(', ')}.`,
            why: 'These allowances let injected scripts run, which removes much of the protection a CSP is meant to give.',
            action: 'Replace inline scripts with nonces or hashes and remove unsafe-eval and wildcard sources from script-src.',
            evidence: `content-security-policy: ${csp}`,
          })
        : f({
            id: 'headers.csp',
            title: 'Content-Security-Policy set',
            status: 'pass',
            found: 'An enforced Content-Security-Policy is present without obviously unsafe script sources.',
            why: 'The browser restricts where resources can load from.',
            action: 'No action needed. Review the policy when you add new third-party scripts.',
            evidence: `content-security-policy: ${csp}`,
          }),
    )
  }

  // Strict-Transport-Security (only meaningful over HTTPS)
  if (opts.isHttps) {
    const hsts = header(headers, 'strict-transport-security')
    const maxAge = hsts ? Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0) : 0
    if (!hsts) {
      out.push(
        f({
          id: 'headers.hsts',
          title: 'Strict-Transport-Security missing',
          status: 'fail',
          severity: 'medium',
          found: 'HTTPS responses do not include an HSTS header.',
          why: "A visitor's first request can be downgraded to plain HTTP by someone on the same network.",
          action: 'Once every subdomain serves HTTPS, add: Strict-Transport-Security: max-age=31536000; includeSubDomains',
          evidence: evidence(where, '(no strict-transport-security header)'),
        }),
      )
    } else if (maxAge < HSTS_MIN_MAX_AGE) {
      out.push(
        f({
          id: 'headers.hsts',
          title: 'Strict-Transport-Security max-age is short',
          status: 'warn',
          severity: 'low',
          found: `HSTS is set with max-age=${maxAge} seconds (about ${Math.round(maxAge / 86400)} days).`,
          why: 'Browsers forget the HTTPS-only rule quickly, so the downgrade protection lapses between visits.',
          action: 'Increase max-age to at least 15552000 (180 days); 31536000 (1 year) is common.',
          evidence: `strict-transport-security: ${hsts}`,
        }),
      )
    } else {
      out.push(
        f({
          id: 'headers.hsts',
          title: 'Strict-Transport-Security set',
          status: 'pass',
          found: `HSTS is set with max-age=${maxAge}.`,
          why: 'Browsers will only connect to the site over HTTPS.',
          action: 'No action needed.',
          evidence: `strict-transport-security: ${hsts}`,
        }),
      )
    }
  }

  // X-Content-Type-Options
  const xcto = header(headers, 'x-content-type-options')
  out.push(
    xcto?.toLowerCase().trim() === 'nosniff'
      ? f({
          id: 'headers.xcto',
          title: 'X-Content-Type-Options set',
          status: 'pass',
          found: 'The header is present with the value nosniff.',
          why: "Browsers won't guess file types, blocking some content-type confusion attacks.",
          action: 'No action needed.',
          evidence: `x-content-type-options: ${xcto}`,
        })
      : f({
          id: 'headers.xcto',
          title: 'X-Content-Type-Options missing',
          status: 'fail',
          severity: 'low',
          found: xcto ? `The header has an unexpected value: ${xcto}.` : 'No X-Content-Type-Options header was returned.',
          why: 'Browsers may guess ("sniff") the type of a file, which can turn an uploaded file into executable script.',
          action: 'Add: X-Content-Type-Options: nosniff',
          evidence: xcto ? `x-content-type-options: ${xcto}` : '(no x-content-type-options header)',
        }),
  )

  // Clickjacking: X-Frame-Options or CSP frame-ancestors
  const xfo = header(headers, 'x-frame-options')
  const frameAncestors = csp ? directive(csp, 'frame-ancestors') : undefined
  const xfoOk = xfo && /^(deny|sameorigin)$/i.test(xfo.trim())
  out.push(
    xfoOk || frameAncestors
      ? f({
          id: 'headers.framing',
          title: 'Clickjacking protection set',
          status: 'pass',
          found: frameAncestors ? `CSP restricts framing (${frameAncestors}).` : `X-Frame-Options is ${xfo}.`,
          why: 'Other sites cannot load your pages in a hidden frame.',
          action: 'No action needed.',
          evidence: evidence(xfo && `x-frame-options: ${xfo}`, frameAncestors && `csp: ${frameAncestors}`),
        })
      : f({
          id: 'headers.framing',
          title: 'Clickjacking protection missing',
          status: 'fail',
          severity: 'medium',
          found: 'Neither X-Frame-Options nor a CSP frame-ancestors directive is set.',
          why: 'Other sites can load your pages in a hidden frame and trick visitors into clicking buttons.',
          action: "Send X-Frame-Options: DENY (or SAMEORIGIN), or frame-ancestors 'none' in your CSP.",
          evidence: evidence(xfo ? `x-frame-options: ${xfo} (invalid value)` : '(no x-frame-options header)', '(no frame-ancestors directive)'),
        }),
  )

  // Referrer-Policy
  const rp = header(headers, 'referrer-policy')
  if (!rp) {
    out.push(
      f({
        id: 'headers.referrer',
        title: 'Referrer-Policy not set',
        status: 'warn',
        severity: 'low',
        found: 'No Referrer-Policy header was returned.',
        why: "Modern browsers default to a safe policy, but older ones may send full URLs (including any tokens in them) to other sites.",
        action: 'Add: Referrer-Policy: strict-origin-when-cross-origin',
        evidence: '(no referrer-policy header)',
      }),
    )
  } else if (/unsafe-url|no-referrer-when-downgrade/i.test(rp)) {
    out.push(
      f({
        id: 'headers.referrer',
        title: 'Referrer-Policy leaks full URLs',
        status: 'fail',
        severity: 'low',
        found: `Referrer-Policy is ${rp}, which sends full page URLs to other sites.`,
        why: 'Paths and query strings, which can contain tokens or personal data, are shared with third parties.',
        action: 'Use strict-origin-when-cross-origin or no-referrer.',
        evidence: `referrer-policy: ${rp}`,
      }),
    )
  } else {
    out.push(
      f({
        id: 'headers.referrer',
        title: 'Referrer-Policy set',
        status: 'pass',
        found: `Referrer-Policy is ${rp}.`,
        why: 'Full URLs are not leaked to other sites.',
        action: 'No action needed.',
        evidence: `referrer-policy: ${rp}`,
      }),
    )
  }

  // Permissions-Policy
  const pp = header(headers, 'permissions-policy')
  out.push(
    pp
      ? f({
          id: 'headers.permissions',
          title: 'Permissions-Policy set',
          status: 'pass',
          found: 'A Permissions-Policy header restricts browser features.',
          why: 'Embedded scripts cannot use features such as camera or location unless you allow them.',
          action: 'No action needed.',
          evidence: `permissions-policy: ${pp}`,
        })
      : f({
          id: 'headers.permissions',
          title: 'Permissions-Policy not set',
          status: 'warn',
          severity: 'low',
          confidence: 'medium',
          found: 'No Permissions-Policy header was returned.',
          why: 'Embedded scripts could request browser features such as camera or location that your site never uses.',
          action: 'Disable unused features, for example: Permissions-Policy: camera=(), microphone=(), geolocation=()',
          evidence: '(no permissions-policy header)',
        }),
  )

  // Server information disclosure (Module 5, passive)
  const server = header(headers, 'server')
  const poweredBy = header(headers, 'x-powered-by')
  const aspnet = header(headers, 'x-aspnet-version') ?? header(headers, 'x-aspnetmvc-version')
  const leaks = [
    server && /\d/.test(server) && `server: ${server}`,
    poweredBy && `x-powered-by: ${poweredBy}`,
    aspnet && `x-aspnet-version: ${aspnet}`,
  ].filter(Boolean) as string[]
  out.push(
    leaks.length
      ? exposure({
          id: 'exposure.server-info',
          title: 'Server software version disclosed',
          status: 'warn',
          severity: 'low',
          found: 'Response headers reveal the server software and version.',
          why: 'Attackers can match the exact version against known vulnerabilities without probing further.',
          action: 'Hide version details, e.g. server_tokens off (Nginx), ServerTokens Prod (Apache), and remove X-Powered-By.',
          evidence: leaks.join('\n'),
        })
      : exposure({
          id: 'exposure.server-info',
          title: 'No server version disclosed',
          status: 'pass',
          found: 'Response headers do not reveal software version numbers.',
          why: 'Less information is available to attackers fingerprinting your stack.',
          action: 'No action needed.',
          evidence: server ? `server: ${server}` : '(no server header)',
        }),
  )

  return out
}
