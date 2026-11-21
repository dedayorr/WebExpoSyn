import { errorMessage, evidence, makeFinding } from '../lib/finding.js'
import { safeFetch, type SafeResponse } from '../lib/safeFetch.js'
import type { ResolvedTarget } from '../lib/target.js'
import type { Finding, Severity } from '../types.js'

const f = makeFinding('exposure')

/**
 * Module 5: controlled exposure checks.
 *
 * Only runs for domains whose ownership has been verified. Uses a short,
 * fixed list of requests with content signatures (not just status codes) so
 * "soft 404" pages don't produce false positives. Never brute-forces paths,
 * never sends payloads, never executes anything it downloads.
 */

interface SensitivePath {
  path: string
  label: string
  severity: Severity
  /** Response must match this to count as exposed. */
  signature: RegExp
  why: string
  action: string
  /**
   * Safe description of what was found. Must NEVER include secret values:
   * reports can be downloaded and shared.
   */
  describe?: (body: string) => string
}

const count = (re: RegExp, body: string) => (body.match(re) ?? []).length

export const SENSITIVE_PATHS: SensitivePath[] = [
  {
    path: '/.git/HEAD',
    describe: (b) => (/^ref: refs\/heads\/[\w.\/-]{1,60}/m.exec(b)?.[0] ?? 'commit hash returned'),
    label: 'Git repository metadata (/.git/)',
    severity: 'critical',
    signature: /^(ref: refs\/|[0-9a-f]{40}\s*$)/m,
    why: 'Anyone can reconstruct your source code and its history, including any passwords or API keys ever committed.',
    action: 'Block /.git/ in your web server configuration, remove it from the web root, and rotate any credentials that were ever committed.',
  },
  {
    path: '/.env',
    describe: (b) => `variable names found: ${[...b.matchAll(/^([A-Z][A-Z0-9_]{2,40})=/gm)].slice(0, 6).map((m) => m[1]).join(', ')} (values hidden)`,
    label: 'Environment file (/.env)',
    severity: 'critical',
    signature: /^(?!<)[A-Z][A-Z0-9_]{2,}=\S*/m,
    why: 'Environment files usually hold database passwords, API keys and secret tokens.',
    action: 'Delete the file from the web root, block dotfiles in your server configuration and rotate every secret it contained.',
  },
  {
    path: '/.htpasswd',
    describe: (b) => `${count(/^[^:\s<]+:/gm, b)} password hash entries (hidden)`,
    label: 'Password file (/.htpasswd)',
    severity: 'critical',
    signature: /^[^:\s<]+:(\$apr1\$|\$2[aby]\$|\{SHA\}|[./0-9A-Za-z]{13})/m,
    why: 'Password hashes can be cracked offline.',
    action: 'Move the file outside the web root and change the affected passwords.',
  },
  {
    path: '/backup.sql',
    describe: (b) => `${count(/CREATE TABLE/gi, b)} CREATE TABLE and ${count(/INSERT INTO/gi, b)} INSERT statements in the first 16 KB (contents hidden)`,
    label: 'Database dump (/backup.sql)',
    severity: 'critical',
    signature: /(CREATE TABLE|INSERT INTO)\s/i,
    why: 'A database dump can expose every customer record and password hash.',
    action: 'Delete the dump from the web root and store backups somewhere private.',
  },
  {
    path: '/wp-config.php.bak',
    describe: () => 'file contains DB_PASSWORD (value hidden)',
    label: 'WordPress config backup',
    severity: 'critical',
    signature: /DB_PASSWORD/,
    why: 'Backup copies of wp-config are served as plain text, exposing database credentials.',
    action: 'Delete the backup file and change the database password.',
  },
  {
    path: '/phpinfo.php',
    describe: () => 'phpinfo() output returned',
    label: 'PHP info page (/phpinfo.php)',
    severity: 'medium',
    signature: /phpinfo\(\)|<title>PHP \d/i,
    why: 'Reveals server paths, software versions and configuration that help attackers plan an attack.',
    action: 'Delete phpinfo.php from the server.',
  },
  {
    path: '/server-status',
    describe: () => 'Apache server-status page returned',
    label: 'Apache server-status page',
    severity: 'medium',
    signature: /Apache Server Status/i,
    why: 'Shows live requests, client IPs and internal URLs.',
    action: 'Restrict /server-status to localhost or disable mod_status.',
  },
  {
    path: '/.DS_Store',
    describe: () => '.DS_Store index file returned',
    label: 'macOS folder index (/.DS_Store)',
    severity: 'low',
    signature: /Bud1/,
    why: 'Lists the names of files in the folder, which can reveal hidden or backup files.',
    action: 'Delete .DS_Store files from the server and block dotfiles.',
  },
]

export const LISTING_PATHS = ['/', '/uploads/', '/backup/', '/files/']
export const STAGING_SUBDOMAINS = ['staging', 'dev', 'test', 'beta']

const LISTING_SIGNATURE = /<title>\s*Index of \/|<h1>\s*Index of \/|Directory listing for \//i

export type Fetcher = (url: string) => Promise<SafeResponse>

const defaultFetcher: Fetcher = (url) =>
  safeFetch(url, { maxBytes: 16 * 1024, maxRedirects: 2, timeoutMs: 6_000, insecureTls: true })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runExposureChecks(
  target: ResolvedTarget,
  opts: { ownershipVerified: boolean; fetcher?: Fetcher; delayMs?: number },
): Promise<Finding[]> {
  if (!opts.ownershipVerified) {
    return [
      f({
        id: 'exposure.gated',
        title: 'Exposure checks need ownership verification',
        status: 'unverified',
        found: 'Sensitive file, directory listing and staging checks only run on domains you have verified.',
        why: 'These checks send targeted requests, so we only run them for site owners.',
        action: `Add the WebExpoSyn TXT record to ${target.domain}, then rescan.`,
        evidence: 'ownership: not verified',
      }),
    ]
  }

  const fetcher = opts.fetcher ?? defaultFetcher
  const delayMs = opts.delayMs ?? 150
  const base = `https://${target.hostname}`
  const out: Finding[] = []

  // Sensitive files
  const exposed: { p: SensitivePath; status: number; summary: string }[] = []
  const checked: string[] = []
  for (const p of SENSITIVE_PATHS) {
    try {
      const res = await fetcher(`${base}${p.path}`)
      checked.push(`${p.path} → ${res.status}`)
      if (res.status === 200 && p.signature.test(res.body)) {
        exposed.push({ p, status: res.status, summary: p.describe?.(res.body) ?? 'signature matched (contents hidden)' })
      }
    } catch (err) {
      checked.push(`${p.path} → ${errorMessage(err)}`)
    }
    await sleep(delayMs)
  }
  for (const e of exposed) {
    out.push(
      f({
        id: `exposure.file${e.p.path.replace(/[^a-z0-9]+/gi, '-')}`,
        title: `${e.p.label} publicly accessible`,
        status: 'fail',
        severity: e.p.severity,
        found: `A request for ${e.p.path} returned content that matches a real ${e.p.label.toLowerCase()}.`,
        why: e.p.why,
        action: e.p.action,
        // Only a safe description: the report itself must never become a copy of a leaked secret.
        evidence: evidence(`GET ${base}${e.p.path}`, `→ ${e.status} OK`, e.summary),
      }),
    )
  }
  if (!exposed.length) {
    out.push(
      f({
        id: 'exposure.files',
        title: 'No sensitive files exposed',
        status: 'pass',
        found: `None of the ${SENSITIVE_PATHS.length} common sensitive files we checked are publicly readable.`,
        why: 'Source code, secrets and backups are not served to the public.',
        action: 'No action needed.',
        evidence: checked.join('\n'),
      }),
    )
  }

  // Directory listings
  const listings: string[] = []
  const listingLines: string[] = []
  for (const path of LISTING_PATHS) {
    try {
      const res = await fetcher(`${base}${path}`)
      listingLines.push(`${path} → ${res.status}`)
      if (res.status === 200 && LISTING_SIGNATURE.test(res.body)) listings.push(path)
    } catch (err) {
      listingLines.push(`${path} → ${errorMessage(err)}`)
    }
    await sleep(delayMs)
  }
  out.push(
    listings.length
      ? f({
          id: 'exposure.listing',
          title: 'Directory listing enabled',
          status: 'fail',
          severity: 'medium',
          found: `The server shows a file listing for ${listings.join(', ')}.`,
          why: 'Anyone can browse every file in those folders, including ones you never linked to.',
          action: 'Disable directory indexes (Options -Indexes on Apache, autoindex off on Nginx).',
          evidence: listingLines.join('\n'),
        })
      : f({
          id: 'exposure.listing',
          title: 'No directory listings exposed',
          status: 'pass',
          found: 'Common folders did not return auto-generated file listings.',
          why: 'Your file structure isn’t browsable by strangers.',
          action: 'No action needed.',
          evidence: listingLines.join('\n'),
        }),
  )

  // Public staging / development environments
  const publicEnvs: string[] = []
  const envLines: string[] = []
  for (const sub of STAGING_SUBDOMAINS) {
    const host = `${sub}.${target.domain}`
    try {
      const res = await fetcher(`https://${host}/`)
      envLines.push(`${host} → ${res.status}`)
      if (res.status < 400 && res.status !== 0) publicEnvs.push(host)
    } catch (err) {
      envLines.push(`${host} → ${errorMessage(err)}`)
    }
    await sleep(delayMs)
  }
  out.push(
    publicEnvs.length
      ? f({
          id: 'exposure.staging',
          title: 'Staging or development site publicly reachable',
          status: 'warn',
          severity: 'medium',
          confidence: 'medium',
          found: `${publicEnvs.join(', ')} responded without requiring a login.`,
          why: 'Non-production sites often run debug settings, old code or test data and are patched less often.',
          action: 'Put staging sites behind authentication or an IP allowlist, or remove them when not in use.',
          evidence: envLines.join('\n'),
        })
      : f({
          id: 'exposure.staging',
          title: 'No public staging environments found',
          status: 'pass',
          found: `None of ${STAGING_SUBDOMAINS.map((s) => `${s}.${target.domain}`).join(', ')} served a public site.`,
          why: 'Test and development versions of your site are not exposed.',
          action: 'No action needed.',
          evidence: envLines.join('\n'),
        }),
  )

  return out
}
