import tls, { type PeerCertificate, type SecureVersion } from 'node:tls'
import { errorMessage, evidence, makeFinding } from '../lib/finding.js'
import { safeFetch } from '../lib/safeFetch.js'
import type { ResolvedTarget } from '../lib/target.js'
import type { Finding } from '../types.js'

const f = makeFinding('tls')
const DAY = 86_400_000

interface Handshake {
  protocol: string | null
  cert: PeerCertificate
  authorized: boolean
  authorizationError?: string
}

function handshake(
  hostname: string,
  address: string,
  opts: { minVersion?: SecureVersion; maxVersion?: SecureVersion; ciphers?: string } = {},
  timeoutMs = 6_000,
): Promise<Handshake> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: address, // pinned, already validated public IP
      servername: hostname, // SNI
      port: 443,
      rejectUnauthorized: false, // we inspect trust ourselves and report it
      timeout: timeoutMs,
      ...opts,
    })
    const fail = (err: Error) => {
      socket.destroy()
      reject(err)
    }
    socket.once('secureConnect', () => {
      const result: Handshake = {
        protocol: socket.getProtocol(),
        cert: socket.getPeerCertificate(true),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
      }
      socket.end()
      resolve(result)
    })
    socket.once('timeout', () => fail(Object.assign(new Error('TLS handshake timed out'), { code: 'ETIMEDOUT' })))
    socket.once('error', fail)
  })
}

/** Tests whether the server accepts a specific (legacy) protocol version. */
async function acceptsVersion(hostname: string, address: string, version: SecureVersion): Promise<boolean | 'unknown'> {
  try {
    await handshake(hostname, address, {
      minVersion: version,
      maxVersion: version,
      // OpenSSL 3 disables TLS 1.0/1.1 at the default security level; lower it
      // for this probe only so we can tell whether the SERVER still allows them.
      ciphers: 'DEFAULT@SECLEVEL=0',
    })
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? ''
    // Our own TLS library refused to offer the version: we can't tell.
    if (/NO_PROTOCOLS_AVAILABLE|UNSUPPORTED_PROTOCOL.*client/i.test(code)) return 'unknown'
    if (code === 'ETIMEDOUT') return 'unknown'
    return false
  }
}

/** Module 1: SSL/TLS analysis. */
export async function runTlsChecks(target: ResolvedTarget): Promise<Finding[]> {
  const out: Finding[] = []
  const { hostname } = target
  const address = target.addresses[0].address

  let hs: Handshake
  try {
    hs = await handshake(hostname, address)
  } catch (err) {
    out.push(
      f({
        id: 'tls.https',
        title: 'HTTPS not available',
        status: 'fail',
        severity: 'high',
        found: `We could not complete a TLS connection to ${hostname} on port 443.`,
        why: 'Without HTTPS, everything visitors send and receive, including passwords, can be read or changed in transit.',
        action: 'Install a TLS certificate (free from Let’s Encrypt or your host) and serve the site over HTTPS.',
        evidence: `tls.connect ${hostname}:443 → ${errorMessage(err)}`,
      }),
    )
    return out
  }

  const { cert } = hs
  out.push(
    f({
      id: 'tls.https',
      title: 'HTTPS available',
      status: 'pass',
      found: `The server accepted a TLS connection using ${hs.protocol}.`,
      why: 'Traffic between visitors and the site can be encrypted.',
      action: 'No action needed.',
      evidence: `tls.connect ${hostname}:443 → ${hs.protocol}`,
    }),
  )

  // Trust chain
  out.push(
    hs.authorized
      ? f({
          id: 'tls.trust',
          title: 'Certificate is trusted',
          status: 'pass',
          found: `The certificate chains to a trusted authority (${cert.issuer?.O ?? cert.issuer?.CN ?? 'unknown issuer'}).`,
          why: 'Browsers will not show security warnings.',
          action: 'No action needed.',
          evidence: evidence(`issuer: ${cert.issuer?.CN ?? ''} ${cert.issuer?.O ? `(${cert.issuer.O})` : ''}`),
        })
      : f({
          id: 'tls.trust',
          title: 'Certificate is not trusted',
          status: 'fail',
          severity: 'high',
          found: `Browsers would reject the certificate: ${hs.authorizationError ?? 'unknown reason'}.`,
          why: 'Visitors see a full-page security warning, and attackers can impersonate the site more easily.',
          action: 'Install a certificate from a public authority and include the full intermediate chain.',
          evidence: evidence(`authorizationError: ${hs.authorizationError}`, `issuer: ${cert.issuer?.CN ?? 'n/a'}`),
        }),
  )

  // Hostname match
  const mismatch = tls.checkServerIdentity(hostname, cert)
  const san = cert.subjectaltname ?? ''
  out.push(
    mismatch
      ? f({
          id: 'tls.hostname',
          title: 'Certificate does not match the domain',
          status: 'fail',
          severity: 'high',
          found: `The certificate is not valid for ${hostname}.`,
          why: 'Browsers will show a warning and refuse to treat the connection as secure.',
          action: `Issue a certificate that covers ${hostname} (and www, if used).`,
          evidence: evidence(`subject: CN=${cert.subject?.CN ?? ''}`, san && `subjectAltName: ${san}`, mismatch.message),
        })
      : f({
          id: 'tls.hostname',
          title: 'Certificate matches the domain',
          status: 'pass',
          found: `The certificate covers ${hostname}.`,
          why: 'Visitors connect to the site they expect.',
          action: 'No action needed.',
          evidence: evidence(`subject: CN=${cert.subject?.CN ?? ''}`, san && `subjectAltName: ${san.slice(0, 300)}`),
        }),
  )

  // Validity window
  const validFrom = new Date(cert.valid_from)
  const validTo = new Date(cert.valid_to)
  const daysLeft = Math.floor((validTo.getTime() - Date.now()) / DAY)
  const dates = `valid from ${validFrom.toISOString().slice(0, 10)} to ${validTo.toISOString().slice(0, 10)}`
  if (validFrom.getTime() > Date.now()) {
    out.push(
      f({
        id: 'tls.expiry',
        title: 'Certificate not yet valid',
        status: 'fail',
        severity: 'high',
        found: `The certificate only becomes valid on ${validFrom.toISOString().slice(0, 10)}.`,
        why: 'Browsers reject it until then.',
        action: 'Check the server clock and reinstall a currently valid certificate.',
        evidence: dates,
      }),
    )
  } else if (daysLeft < 0) {
    out.push(
      f({
        id: 'tls.expiry',
        title: 'Certificate has expired',
        status: 'fail',
        severity: 'critical',
        found: `The certificate expired ${Math.abs(daysLeft)} days ago.`,
        why: 'Every visitor sees a security warning and many will leave.',
        action: 'Renew the certificate now and enable automatic renewal.',
        evidence: dates,
      }),
    )
  } else if (daysLeft < 14) {
    out.push(
      f({
        id: 'tls.expiry',
        title: 'Certificate expires very soon',
        status: 'warn',
        severity: 'high',
        found: `The certificate expires in ${daysLeft} days.`,
        why: 'If renewal fails, visitors will see security warnings.',
        action: 'Renew now and confirm automatic renewal is working.',
        evidence: dates,
      }),
    )
  } else if (daysLeft < 30) {
    out.push(
      f({
        id: 'tls.expiry',
        title: 'Certificate expires within 30 days',
        status: 'warn',
        severity: 'low',
        found: `The certificate expires in ${daysLeft} days.`,
        why: 'Short-lived certificates are normal, but renewal must succeed in time.',
        action: 'Confirm automatic renewal is configured.',
        evidence: dates,
      }),
    )
  } else {
    out.push(
      f({
        id: 'tls.expiry',
        title: 'Certificate is within its validity period',
        status: 'pass',
        found: `The certificate is valid for another ${daysLeft} days.`,
        why: 'No expiry warnings for visitors.',
        action: 'No action needed. Keep automatic renewal enabled.',
        evidence: dates,
      }),
    )
  }

  // Protocol versions
  const [tls10, tls11, tls12, tls13] = await Promise.all([
    acceptsVersion(hostname, address, 'TLSv1'),
    acceptsVersion(hostname, address, 'TLSv1.1'),
    acceptsVersion(hostname, address, 'TLSv1.2'),
    acceptsVersion(hostname, address, 'TLSv1.3'),
  ])
  const fmt = (v: boolean | 'unknown') => (v === 'unknown' ? 'could not test' : v ? 'accepted' : 'rejected')
  const versionEvidence = evidence(
    `TLSv1.0: ${fmt(tls10)}`,
    `TLSv1.1: ${fmt(tls11)}`,
    `TLSv1.2: ${fmt(tls12)}`,
    `TLSv1.3: ${fmt(tls13)}`,
  )
  const legacy = [tls10 === true && 'TLS 1.0', tls11 === true && 'TLS 1.1'].filter(Boolean)
  if (legacy.length) {
    out.push(
      f({
        id: 'tls.legacy',
        title: `${legacy.join(' and ')} still accepted`,
        status: 'warn',
        severity: 'medium',
        found: `The server completed handshakes using ${legacy.join(' and ')}.`,
        why: 'These deprecated protocols have known weaknesses and are rejected by modern browsers.',
        action: 'Disable TLS 1.0 and 1.1 and keep TLS 1.2 and 1.3 enabled.',
        evidence: versionEvidence,
      }),
    )
  } else if (tls10 === 'unknown' || tls11 === 'unknown') {
    out.push(
      f({
        id: 'tls.legacy',
        title: 'Legacy TLS support could not be tested',
        status: 'unverified',
        found: 'Our scanner could not attempt TLS 1.0/1.1 handshakes from this environment.',
        why: 'We can’t confirm whether deprecated protocols are disabled, so this is neither a pass nor a failure.',
        action: 'Check your server configuration, or use an external TLS tester.',
        evidence: versionEvidence,
      }),
    )
  } else {
    out.push(
      f({
        id: 'tls.legacy',
        title: 'Legacy TLS versions disabled',
        status: 'pass',
        found: 'The server rejected TLS 1.0 and TLS 1.1 handshakes.',
        why: 'Visitors are protected from downgrade to weak protocols.',
        action: 'No action needed.',
        evidence: versionEvidence,
      }),
    )
  }
  out.push(
    tls13 === true
      ? f({
          id: 'tls.modern',
          title: 'TLS 1.3 supported',
          status: 'pass',
          found: 'The server supports TLS 1.3.',
          why: 'Faster, more secure connections for modern browsers.',
          action: 'No action needed.',
          evidence: versionEvidence,
        })
      : f({
          id: 'tls.modern',
          title: 'TLS 1.3 not supported',
          status: 'warn',
          severity: 'low',
          confidence: tls13 === 'unknown' ? 'low' : 'high',
          found: tls12 === true ? 'The server supports TLS 1.2 but not TLS 1.3.' : 'The server does not appear to support TLS 1.3.',
          why: 'TLS 1.3 removes older, weaker options and speeds up connections.',
          action: 'Enable TLS 1.3 on your server or CDN.',
          evidence: versionEvidence,
        }),
  )

  // HTTP → HTTPS redirect
  try {
    const res = await safeFetch(`http://${hostname}/`, { method: 'GET', maxBytes: 8 * 1024, insecureTls: true })
    const enforced = res.finalUrl.startsWith('https://') || res.redirects.some((r) => r.url.startsWith('https://'))
    const chain = [...res.redirects.map((r) => `${r.url} → ${r.status}`), `${res.finalUrl} → ${res.status}`].join('\n')
    out.push(
      enforced
        ? f({
            id: 'tls.redirect',
            title: 'HTTP redirects to HTTPS',
            status: 'pass',
            found: 'Plain HTTP requests are redirected to HTTPS.',
            why: 'Visitors end up on an encrypted connection even if they type the address without https://.',
            action: 'No action needed.',
            evidence: chain,
          })
        : f({
            id: 'tls.redirect',
            title: 'HTTP does not redirect to HTTPS',
            status: 'fail',
            severity: 'medium',
            found: 'The site still serves content over plain HTTP instead of redirecting.',
            why: 'Visitors who type the address without https:// browse unencrypted.',
            action: 'Add a permanent (301) redirect from http:// to https:// for every page.',
            evidence: chain,
          }),
    )
  } catch (err) {
    out.push(
      f({
        id: 'tls.redirect',
        title: 'HTTP to HTTPS redirect could not be checked',
        status: 'unverified',
        found: 'The plain HTTP version of the site did not respond.',
        why: 'Many HTTPS-only sites close port 80, which is fine, but we can’t confirm the behaviour.',
        action: 'If port 80 is open, make sure it redirects to HTTPS.',
        evidence: `GET http://${hostname}/ → ${errorMessage(err)}`,
      }),
    )
  }

  return out
}
