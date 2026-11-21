/**
 * Sample assessment data for example-shop.com.
 * Illustrative only: replace with real API responses from the scan engine.
 */
import type { Finding, HistoryPoint, ModuleId, ModuleSummary, ScanStep, Website } from '@/types'

export const SAMPLE_DOMAIN = 'example-shop.com'
export const ASSESSED_AT = '21 Nov 2026, 02:14'

export const MODULE_LABELS: Record<ModuleId, string> = {
  tls: 'SSL/TLS',
  headers: 'HTTP headers',
  dns: 'DNS security',
  email: 'Email security',
  exposure: 'Website exposure',
}

export const moduleSummaries: ModuleSummary[] = [
  { id: 'tls', name: 'SSL/TLS', pass: 7, fail: 0, warn: 1, unverified: 0 },
  { id: 'headers', name: 'HTTP headers', pass: 2, fail: 3, warn: 1, unverified: 0 },
  { id: 'dns', name: 'DNS security', pass: 5, fail: 0, warn: 1, unverified: 1 },
  { id: 'email', name: 'Email security', pass: 3, fail: 2, warn: 0, unverified: 1 },
  { id: 'exposure', name: 'Website exposure', pass: 9, fail: 1, warn: 0, unverified: 0 },
]

export const totals = moduleSummaries.reduce(
  (acc, m) => ({
    pass: acc.pass + m.pass,
    fail: acc.fail + m.fail,
    warn: acc.warn + m.warn,
    unverified: acc.unverified + m.unverified,
  }),
  { pass: 0, fail: 0, warn: 0, unverified: 0 },
)
export const totalChecks = totals.pass + totals.fail + totals.warn + totals.unverified

export const findings: Finding[] = [
  {
    id: 'git', title: '/.git/ directory publicly accessible', module: 'exposure', status: 'fail', severity: 'critical', confidence: 'high',
    found: 'A request for /.git/HEAD returned the repository reference, so the Git metadata folder is served publicly.',
    why: 'Anyone can reconstruct your source code and its history, including any passwords or API keys ever committed.',
    action: 'Block /.git/ in your web server configuration, remove it from the web root, and rotate any credentials that were ever committed.',
    evidence: 'GET https://example-shop.com/.git/HEAD\n→ 200 OK\nref: refs/heads/main',
  },
  {
    id: 'dmarc', title: 'DMARC policy set to p=none', module: 'email', status: 'fail', severity: 'high', confidence: 'high',
    found: 'A DMARC record exists, but its policy only monitors mail and asks receivers to take no action.',
    why: 'Emails spoofing your domain will still be delivered, which makes phishing in your name easier.',
    action: 'Review your DMARC aggregate reports, then move to p=quarantine and finally p=reject once legitimate senders pass.',
    evidence: '_dmarc.example-shop.com TXT\n"v=DMARC1; p=none; rua=mailto:dmarc@example-shop.com"',
  },
  {
    id: 'csp', title: 'Content-Security-Policy missing', module: 'headers', status: 'fail', severity: 'high', confidence: 'high',
    found: "The website's HTTP response did not include a Content-Security-Policy header.",
    why: 'A well-configured CSP restricts where the browser loads resources from, reducing the impact of certain injection attacks.',
    action: 'Define and test an appropriate Content Security Policy, starting in report-only mode.',
    evidence: 'GET https://example-shop.com/\n→ 200 OK\n(no content-security-policy header)',
  },
  {
    id: 'hsts', title: 'Strict-Transport-Security missing', module: 'headers', status: 'fail', severity: 'medium', confidence: 'high',
    found: 'HTTPS responses do not include an HSTS header.',
    why: "A visitor's first request can be downgraded to plain HTTP by someone on the same network.",
    action: 'Once every subdomain serves HTTPS, add: Strict-Transport-Security: max-age=31536000; includeSubDomains',
    evidence: 'GET https://example-shop.com/\n(no strict-transport-security header)',
  },
  {
    id: 'xfo', title: 'Clickjacking protection missing', module: 'headers', status: 'fail', severity: 'medium', confidence: 'high',
    found: 'Neither X-Frame-Options nor a CSP frame-ancestors directive is set.',
    why: 'Other sites can load your pages in a hidden frame and trick visitors into clicking buttons.',
    action: "Send X-Frame-Options: DENY, or frame-ancestors 'none' in your CSP.",
    evidence: '(no x-frame-options header)\n(no frame-ancestors directive)',
  },
  {
    id: 'spf', title: 'SPF exceeds the 10 DNS lookup limit', module: 'email', status: 'fail', severity: 'medium', confidence: 'high',
    found: 'Evaluating your SPF record requires 12 DNS lookups.',
    why: 'Receivers may return a permanent error and treat your legitimate mail as failing SPF.',
    action: 'Remove senders you no longer use, or replace nested includes with direct IP ranges.',
    evidence: 'v=spf1 include:_spf.mailhost.com include:sendgrid.net include:… ~all\nlookups: 12 / 10',
  },
  {
    id: 'tls10', title: 'TLS 1.0 and 1.1 still accepted', module: 'tls', status: 'warn', severity: 'medium', confidence: 'high',
    found: 'The server completed handshakes using TLS 1.0 and TLS 1.1.',
    why: 'These deprecated protocols have known weaknesses and are rejected by modern browsers.',
    action: 'Disable TLS 1.0 and 1.1 and keep TLS 1.2 and 1.3 enabled.',
    evidence: 'TLSv1.0 handshake: accepted\nTLSv1.1 handshake: accepted\nTLSv1.2, TLSv1.3: accepted',
  },
  {
    id: 'pp', title: 'Permissions-Policy not set', module: 'headers', status: 'warn', severity: 'low', confidence: 'medium',
    found: 'No Permissions-Policy header was returned.',
    why: 'Embedded scripts could request browser features such as camera or location that your site never uses.',
    action: 'Disable unused features, for example: Permissions-Policy: camera=(), microphone=(), geolocation=()',
    evidence: '(no permissions-policy header)',
  },
  {
    id: 'dnssec', title: 'DNSSEC not enabled', module: 'dns', status: 'warn', severity: 'low', confidence: 'high',
    found: 'No DS record was found for the domain at the parent zone.',
    why: 'Without DNSSEC, forged DNS answers are harder for resolvers to detect.',
    action: 'Enable DNSSEC at your DNS provider and publish the DS record through your registrar.',
    evidence: 'example-shop.com DS: no record',
  },
  {
    id: 'dkim', title: 'DKIM could not be checked', module: 'email', status: 'unverified', severity: 'info', confidence: 'n/a',
    found: 'DKIM keys live under a selector name, and none was supplied for this scan.',
    why: "We can't confirm your mail is signed, so this check is neither a pass nor a failure.",
    action: 'Add the DKIM selector from your email provider in the domain settings, then rescan.',
    evidence: 'selector: not provided',
  },
  {
    id: 'ns', title: 'Nameserver consistency not confirmed', module: 'dns', status: 'unverified', severity: 'info', confidence: 'n/a',
    found: 'One of the two nameservers did not answer within the time limit.',
    why: "We couldn't compare records across both nameservers.",
    action: 'Rescan later. If it persists, check ns2 with your DNS provider.',
    evidence: 'ns1.dnshost.net: answered\nns2.dnshost.net: timeout after 5s',
  },
  {
    id: 'cert', title: 'Certificate valid and matches domain', module: 'tls', status: 'pass', severity: 'none', confidence: 'high',
    found: 'The certificate chain is trusted, covers example-shop.com and expires on 14 Feb 2027.',
    why: 'Visitors see no browser warnings and the connection is authenticated.',
    action: "No action needed. Renew before expiry; we'll remind you 30 days ahead.",
    evidence: 'subject: CN=example-shop.com\nexpires: 2027-02-14',
  },
  {
    id: 'redir', title: 'HTTP redirects to HTTPS', module: 'tls', status: 'pass', severity: 'none', confidence: 'high',
    found: 'Plain HTTP requests are permanently redirected to HTTPS.',
    why: 'Visitors end up on an encrypted connection.',
    action: 'No action needed.',
    evidence: 'GET http://example-shop.com/\n→ 301 https://example-shop.com/',
  },
  {
    id: 'xcto', title: 'X-Content-Type-Options set', module: 'headers', status: 'pass', severity: 'none', confidence: 'high',
    found: 'The header is present with the value nosniff.',
    why: "Browsers won't guess file types, blocking some content-type attacks.",
    action: 'No action needed.',
    evidence: 'x-content-type-options: nosniff',
  },
  {
    id: 'caa', title: 'CAA record restricts certificate issuers', module: 'dns', status: 'pass', severity: 'none', confidence: 'high',
    found: 'A CAA record limits which certificate authorities may issue for the domain.',
    why: 'Reduces the risk of a certificate being mis-issued for your domain.',
    action: 'No action needed.',
    evidence: 'example-shop.com CAA 0 issue "letsencrypt.org"',
  },
  {
    id: 'dirlist', title: 'No directory listings exposed', module: 'exposure', status: 'pass', severity: 'none', confidence: 'medium',
    found: 'Common folders did not return auto-generated file listings.',
    why: "Your file structure isn't browsable by strangers.",
    action: 'No action needed.',
    evidence: '/uploads/ → 403\n/backup/ → 404',
  },
]

export const severityCounts = {
  critical: findings.filter((f) => f.severity === 'critical').length,
  high: findings.filter((f) => f.severity === 'high').length,
  medium: findings.filter((f) => f.severity === 'medium').length,
  low: findings.filter((f) => f.severity === 'low').length,
}

export const scanSteps: ScanStep[] = [
  { title: 'Validating domain', detail: 'URL format, public address, redirect chain', checks: 0, log: [
    { message: 'Resolved example-shop.com → public IP, not private or loopback', status: 'info' },
    { message: 'Protocol restricted to HTTPS, port 443', status: 'info' },
  ] },
  { title: 'Gathering information', detail: 'DNS records, TLS certificate, response headers', checks: 0, log: [
    { message: 'Fetched A, AAAA, MX, NS, TXT, CAA records', status: 'info' },
    { message: 'Retrieved certificate chain and response headers', status: 'info' },
  ] },
  { title: 'SSL/TLS analysis', detail: '8 checks', checks: 8, log: [
    { message: 'PASS  Certificate valid, matches domain', status: 'pass' },
    { message: 'WARN  TLS 1.0 and 1.1 still accepted', status: 'warn' },
  ] },
  { title: 'HTTP security headers', detail: '6 checks', checks: 6, log: [
    { message: 'FAIL  Content-Security-Policy missing', status: 'fail' },
    { message: 'FAIL  Strict-Transport-Security missing', status: 'fail' },
  ] },
  { title: 'DNS security', detail: '7 checks', checks: 7, log: [
    { message: 'PASS  CAA record restricts issuers', status: 'pass' },
    { message: 'N/V   One nameserver timed out', status: 'unverified' },
  ] },
  { title: 'Email security', detail: '6 checks', checks: 6, log: [
    { message: 'FAIL  DMARC policy is p=none', status: 'fail' },
    { message: 'N/V   DKIM: no selector supplied', status: 'unverified' },
  ] },
  { title: 'Website exposure', detail: '10 controlled requests', checks: 10, log: [
    { message: 'FAIL  /.git/HEAD returned 200', status: 'fail' },
    { message: 'PASS  No directory listing on /uploads/', status: 'pass' },
  ] },
  { title: 'Classifying & building report', detail: 'Severity, evidence, confidence', checks: 0, log: [
    { message: 'Report ready: 9 issues, 2 unverified', status: 'info' },
  ] },
]

export const websites: Website[] = [
  { domain: 'example-shop.com', ownership: 'verified', lastScan: 'Today', failed: 6 },
  { domain: 'portfolio.example.dev', ownership: 'verified', lastScan: '18 Nov', failed: 2 },
  { domain: 'blog.example.org', ownership: 'pending', lastScan: '12 Nov', failed: 4 },
]

export const history: HistoryPoint[] = [
  { date: '31 Oct', failed: 11 },
  { date: '7 Nov', failed: 11 },
  { date: '14 Nov', failed: 8 },
  { date: '21 Nov', failed: 6 },
]

export const fixedSinceLastScan = [
  'Server version no longer disclosed',
  'Directory listing on /backup/ closed',
  'X-Content-Type-Options added',
]
