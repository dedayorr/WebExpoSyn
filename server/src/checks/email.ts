import { createDnsClient, orEmpty, txtRecords, type DnsClient } from '../lib/dnsClient.js'
import { errorMessage, evidence, makeFinding } from '../lib/finding.js'
import type { Finding } from '../types.js'

const f = makeFinding('email')

/* ------------------------------------------------------------------ */
/* SPF                                                                 */
/* ------------------------------------------------------------------ */

export interface SpfTerm {
  qualifier: '+' | '-' | '~' | '?'
  mechanism: string
  value?: string
}

export interface ParsedSpf {
  terms: SpfTerm[]
  redirect?: string
  all?: SpfTerm['qualifier']
}

/** Parses a "v=spf1 ..." record into mechanisms (RFC 7208, simplified). */
export function parseSpf(record: string): ParsedSpf {
  const parts = record.trim().split(/\s+/).slice(1)
  const terms: SpfTerm[] = []
  let redirect: string | undefined
  let all: SpfTerm['qualifier'] | undefined
  for (const part of parts) {
    if (/^redirect=/i.test(part)) {
      redirect = part.slice(9)
      continue
    }
    if (/^[a-z]+=/i.test(part)) continue // other modifiers (exp=...)
    const m = /^([+\-~?]?)([a-z0-9]+)(?:[:/](.*))?$/i.exec(part)
    if (!m) continue
    const qualifier = (m[1] || '+') as SpfTerm['qualifier']
    const mechanism = m[2].toLowerCase()
    terms.push({ qualifier, mechanism, value: m[3] })
    if (mechanism === 'all') all = qualifier
  }
  return { terms, redirect, all }
}

const LOOKUP_MECHANISMS = new Set(['include', 'a', 'mx', 'ptr', 'exists'])

/**
 * Counts DNS-querying terms across includes/redirects. RFC 7208 caps this at
 * 10; above that, receivers return "permerror" and SPF effectively fails.
 */
export async function countSpfLookups(
  domain: string,
  client: DnsClient,
  seen = new Set<string>(),
  depth = 0,
): Promise<{ count: number; tree: string[] }> {
  if (depth > 10 || seen.has(domain)) return { count: 0, tree: [] }
  seen.add(domain)
  const record = (await txtRecords(client, domain)).find((r) => /^v=spf1(\s|$)/i.test(r))
  if (!record) return { count: 0, tree: [] }
  const spf = parseSpf(record)
  let count = 0
  const tree: string[] = []
  for (const t of spf.terms) {
    if (!LOOKUP_MECHANISMS.has(t.mechanism)) continue
    count++
    if (t.mechanism === 'include' && t.value) {
      const sub = await countSpfLookups(t.value, client, seen, depth + 1)
      count += sub.count
      tree.push(`${'  '.repeat(depth)}include:${t.value} (+${sub.count})`, ...sub.tree)
    }
  }
  if (spf.redirect) {
    count++
    const sub = await countSpfLookups(spf.redirect, client, seen, depth + 1)
    count += sub.count
    tree.push(`${'  '.repeat(depth)}redirect=${spf.redirect} (+${sub.count})`, ...sub.tree)
  }
  return { count, tree }
}

/* ------------------------------------------------------------------ */
/* DMARC                                                               */
/* ------------------------------------------------------------------ */

export function parseDmarc(record: string): Record<string, string> {
  const tags: Record<string, string> = {}
  for (const part of record.split(';')) {
    const [k, ...rest] = part.split('=')
    if (!k || !rest.length) continue
    tags[k.trim().toLowerCase()] = rest.join('=').trim()
  }
  return tags
}

/* ------------------------------------------------------------------ */
/* Module 4                                                            */
/* ------------------------------------------------------------------ */

/** Selectors tried when the user doesn't supply one. */
export const COMMON_DKIM_SELECTORS = ['default', 'google', 'selector1', 'selector2', 'k1', 's1', 's2', 'mail', 'dkim']

export interface EmailCheckOptions {
  dkimSelectors?: string[]
  client?: DnsClient
}

export async function runEmailChecks(domain: string, opts: EmailCheckOptions = {}): Promise<Finding[]> {
  const client = opts.client ?? createDnsClient()
  const out: Finding[] = []

  const [txt, mx, dmarcTxt] = await Promise.all([
    txtRecords(client, domain),
    orEmpty(client.resolveMx(domain)),
    txtRecords(client, `_dmarc.${domain}`),
  ])
  const sendsMail = mx.length > 0
  const spfRecords = txt.filter((r) => /^v=spf1(\s|$)/i.test(r))

  // ---- SPF ----
  if (spfRecords.length === 0) {
    out.push(
      f({
        id: 'email.spf',
        title: sendsMail ? 'No SPF record' : 'No SPF record (domain does not appear to send mail)',
        status: sendsMail ? 'fail' : 'warn',
        severity: sendsMail ? 'high' : 'low',
        found: `${domain} has no SPF record${sendsMail ? ' but does receive mail (MX records exist)' : ''}.`,
        why: 'Without SPF, receiving servers cannot tell which servers are allowed to send email as your domain.',
        action: sendsMail
          ? 'Publish an SPF record listing your email providers, ending in ~all or -all.'
          : 'If the domain never sends email, publish "v=spf1 -all" so nobody can send as it.',
        evidence: evidence(`${domain} TXT: ${txt.length ? txt.map((t) => `"${t}"`).join(' ') : '(none)'}`, `MX: ${mx.map((m) => m.exchange).join(', ') || '(none)'}`),
      }),
    )
  } else if (spfRecords.length > 1) {
    out.push(
      f({
        id: 'email.spf',
        title: 'Multiple SPF records',
        status: 'fail',
        severity: 'medium',
        found: `${domain} publishes ${spfRecords.length} SPF records.`,
        why: 'SPF allows only one record; with several, receivers return an error and SPF fails for all your mail.',
        action: 'Merge them into a single v=spf1 record.',
        evidence: spfRecords.join('\n'),
      }),
    )
  } else {
    const record = spfRecords[0]
    const spf = parseSpf(record)
    const usesPtr = spf.terms.some((t) => t.mechanism === 'ptr')
    if (spf.all === '+') {
      out.push(
        f({
          id: 'email.spf',
          title: 'SPF allows anyone to send (+all)',
          status: 'fail',
          severity: 'high',
          found: 'The SPF record ends in +all, which authorises every server on the internet.',
          why: 'Spoofed email will pass SPF checks.',
          action: 'Replace +all with ~all or -all.',
          evidence: record,
        }),
      )
    } else if (spf.all === '?' || (!spf.all && !spf.redirect)) {
      out.push(
        f({
          id: 'email.spf',
          title: 'SPF policy is neutral',
          status: 'warn',
          severity: 'medium',
          found: spf.all === '?' ? 'The SPF record ends in ?all (neutral).' : 'The SPF record has no "all" mechanism.',
          why: 'Receivers are told nothing about unlisted senders, so spoofed mail is not penalised.',
          action: 'End the record with ~all (soft fail) or -all (fail).',
          evidence: record,
        }),
      )
    } else {
      out.push(
        f({
          id: 'email.spf',
          title: 'SPF record present',
          status: 'pass',
          found: `A single SPF record is published${spf.all ? `, ending in ${spf.all}all` : ''}.`,
          why: 'Receivers can check that mail claiming to be from your domain comes from approved servers.',
          action: 'No action needed. Update it when you add a new email service.',
          evidence: record,
        }),
      )
    }
    if (usesPtr) {
      out.push(
        f({
          id: 'email.spf-ptr',
          title: 'SPF uses the deprecated ptr mechanism',
          status: 'warn',
          severity: 'low',
          found: 'The SPF record contains "ptr".',
          why: 'ptr is slow, unreliable and discouraged by RFC 7208; some receivers ignore it.',
          action: 'Replace ptr with ip4/ip6 or include mechanisms.',
          evidence: record,
        }),
      )
    }

    try {
      const { count, tree } = await countSpfLookups(domain, client)
      out.push(
        count > 10
          ? f({
              id: 'email.spf-lookups',
              title: 'SPF exceeds the 10 DNS lookup limit',
              status: 'fail',
              severity: 'medium',
              found: `Evaluating your SPF record requires ${count} DNS lookups.`,
              why: 'Receivers may return a permanent error and treat your legitimate mail as failing SPF.',
              action: 'Remove senders you no longer use, or replace nested includes with direct IP ranges.',
              evidence: evidence(record, `lookups: ${count} / 10`, ...tree),
            })
          : f({
              id: 'email.spf-lookups',
              title: 'SPF within the DNS lookup limit',
              status: 'pass',
              found: `Your SPF record needs ${count} of the 10 allowed DNS lookups.`,
              why: 'Receivers can evaluate SPF without errors.',
              action: 'No action needed.',
              evidence: evidence(`lookups: ${count} / 10`, ...tree),
            }),
      )
    } catch (err) {
      out.push(
        f({
          id: 'email.spf-lookups',
          title: 'SPF lookup count could not be checked',
          status: 'unverified',
          found: 'Resolving the SPF includes did not complete.',
          why: 'We can’t confirm the record stays within the 10-lookup limit.',
          action: 'Rescan later.',
          evidence: errorMessage(err),
        }),
      )
    }
  }

  // ---- DMARC ----
  const dmarcRecords = dmarcTxt.filter((r) => /^v=DMARC1/i.test(r))
  if (!dmarcRecords.length) {
    out.push(
      f({
        id: 'email.dmarc',
        title: 'No DMARC record',
        status: 'fail',
        severity: sendsMail || spfRecords.length ? 'high' : 'medium',
        found: `No DMARC record was found at _dmarc.${domain}.`,
        why: 'Without DMARC, receivers have no instruction to reject email that spoofs your domain, and you get no reports about abuse.',
        action: `Start with: _dmarc.${domain} TXT "v=DMARC1; p=none; rua=mailto:dmarc@${domain}", review the reports, then move to quarantine and reject.`,
        evidence: `_dmarc.${domain} TXT: (none)`,
      }),
    )
  } else {
    const record = dmarcRecords[0]
    const tags = parseDmarc(record)
    const p = (tags.p ?? '').toLowerCase()
    const pct = tags.pct ? Number(tags.pct) : 100
    if (p === 'reject' || p === 'quarantine') {
      out.push(
        pct < 100
          ? f({
              id: 'email.dmarc',
              title: `DMARC ${p} applied to only ${pct}% of mail`,
              status: 'warn',
              severity: 'low',
              found: `The DMARC policy is p=${p}, but pct=${pct} limits it to part of your mail.`,
              why: 'The remaining spoofed mail is still delivered.',
              action: 'Raise pct to 100 once legitimate mail passes.',
              evidence: `_dmarc.${domain} TXT "${record}"`,
            })
          : f({
              id: 'email.dmarc',
              title: `DMARC policy is p=${p}`,
              status: 'pass',
              found: `Receivers are told to ${p} email that fails authentication.`,
              why: 'Spoofed email claiming to be from your domain is blocked or sent to spam.',
              action: p === 'quarantine' ? 'Consider moving to p=reject once you are confident in your senders.' : 'No action needed.',
              evidence: `_dmarc.${domain} TXT "${record}"`,
            }),
      )
    } else {
      out.push(
        f({
          id: 'email.dmarc',
          title: p === 'none' ? 'DMARC policy set to p=none' : 'DMARC policy is invalid',
          status: 'fail',
          severity: 'high',
          found:
            p === 'none'
              ? 'A DMARC record exists, but its policy only monitors mail and asks receivers to take no action.'
              : 'The DMARC record has no valid p= policy.',
          why: 'Emails spoofing your domain will still be delivered, which makes phishing in your name easier.',
          action: 'Review your DMARC aggregate reports, then move to p=quarantine and finally p=reject once legitimate senders pass.',
          evidence: `_dmarc.${domain} TXT "${record}"`,
        }),
      )
    }
    if (!tags.rua) {
      out.push(
        f({
          id: 'email.dmarc-reports',
          title: 'DMARC reports not requested',
          status: 'warn',
          severity: 'low',
          found: 'The DMARC record has no rua= address.',
          why: 'You will not receive reports showing who is sending mail as your domain.',
          action: `Add rua=mailto:dmarc@${domain} (or a DMARC reporting service).`,
          evidence: `_dmarc.${domain} TXT "${record}"`,
        }),
      )
    }
  }

  // ---- DKIM ----
  const supplied = (opts.dkimSelectors ?? []).filter(Boolean)
  const selectors = supplied.length ? supplied : COMMON_DKIM_SELECTORS
  const found: { selector: string; record: string }[] = []
  const lookupErrors: string[] = []
  await Promise.all(
    selectors.map(async (selector) => {
      try {
        const rec = (await txtRecords(client, `${selector}._domainkey.${domain}`)).find((r) => /(^|;)\s*(v=DKIM1|k=|p=)/i.test(r))
        if (rec) found.push({ selector, record: rec })
      } catch (err) {
        lookupErrors.push(`${selector}: ${errorMessage(err)}`)
      }
    }),
  )
  const active = found.filter((d) => !/(^|;)\s*p=\s*(;|$)/i.test(d.record))
  const revoked = found.filter((d) => /(^|;)\s*p=\s*(;|$)/i.test(d.record))
  const dkimEvidence = evidence(
    ...found.map((d) => `${d.selector}._domainkey.${domain} TXT "${d.record.slice(0, 120)}${d.record.length > 120 ? '…' : ''}"`),
    ...lookupErrors,
    !found.length && `selectors tried: ${selectors.join(', ')}`,
  )
  if (active.length) {
    out.push(
      f({
        id: 'email.dkim',
        title: 'DKIM key published',
        status: 'pass',
        found: `A DKIM public key was found for selector${active.length > 1 ? 's' : ''} ${active.map((d) => d.selector).join(', ')}.`,
        why: 'Receivers can verify that your mail was signed by you and not altered.',
        action: 'No action needed. Rotate keys periodically.',
        evidence: dkimEvidence,
      }),
    )
  } else if (supplied.length) {
    out.push(
      f({
        id: 'email.dkim',
        title: revoked.length ? 'DKIM key revoked' : 'DKIM key not found',
        status: 'fail',
        severity: 'medium',
        found: revoked.length
          ? `The selector ${revoked.map((d) => d.selector).join(', ')} has an empty key (revoked).`
          : `No DKIM key was found for selector ${supplied.join(', ')}.`,
        why: 'Mail signed with this selector will fail DKIM, weakening DMARC protection.',
        action: 'Publish the DKIM key from your email provider, or check the selector name.',
        evidence: dkimEvidence,
      }),
    )
  } else {
    out.push(
      f({
        id: 'email.dkim',
        title: 'DKIM could not be checked',
        status: 'unverified',
        found: 'DKIM keys live under a selector name. None was supplied and no common selector matched.',
        why: 'We can’t confirm your mail is signed, so this check is neither a pass nor a failure.',
        action: 'Add the DKIM selector from your email provider (e.g. "google" or "selector1") and rescan.',
        evidence: dkimEvidence,
      }),
    )
  }

  return out
}
