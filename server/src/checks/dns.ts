import { createDnsClient, isNoData, orEmpty, type DnsClient } from '../lib/dnsClient.js'
import { dohQuery } from '../lib/doh.js'
import { errorMessage, evidence, makeFinding } from '../lib/finding.js'
import { isPublicIp } from '../lib/ip.js'
import type { Finding } from '../types.js'

const f = makeFinding('dns')

export interface DnsCheckDeps {
  client?: DnsClient
  /** Creates a resolver that queries one specific nameserver IP. */
  clientFor?: (serverIp: string) => DnsClient
  doh?: typeof dohQuery
}

/** Module 3: DNS security analysis for the registrable domain. */
export async function runDnsChecks(domain: string, hostname: string, deps: DnsCheckDeps = {}): Promise<Finding[]> {
  const client = deps.client ?? createDnsClient()
  const clientFor = deps.clientFor ?? ((ip: string) => createDnsClient([ip]))
  const doh = deps.doh ?? dohQuery
  const out: Finding[] = []

  const [a, aaaa, mx, ns] = await Promise.all([
    orEmpty(client.resolve4(domain)),
    orEmpty(client.resolve6(domain)),
    orEmpty(client.resolveMx(domain)),
    orEmpty(client.resolveNs(domain)),
  ])
  const recordSummary = evidence(
    `A: ${a.join(', ') || '(none)'}`,
    `AAAA: ${aaaa.join(', ') || '(none)'}`,
    `MX: ${mx.map((m) => `${m.priority} ${m.exchange}`).join(', ') || '(none)'}`,
    `NS: ${ns.join(', ') || '(none)'}`,
  )

  // Nameserver redundancy
  if (ns.length === 0) {
    out.push(
      f({
        id: 'dns.ns',
        title: 'No nameservers found',
        status: 'fail',
        severity: 'high',
        found: `We could not find NS records for ${domain}.`,
        why: 'Without working nameservers the domain, its website and its email can stop resolving.',
        action: 'Check the nameserver settings at your registrar.',
        evidence: recordSummary,
      }),
    )
  } else if (ns.length === 1) {
    out.push(
      f({
        id: 'dns.ns',
        title: 'Only one nameserver',
        status: 'warn',
        severity: 'low',
        found: `${domain} is served by a single nameserver (${ns[0]}).`,
        why: 'If that server fails, the whole domain stops resolving.',
        action: 'Use at least two nameservers, ideally on different networks.',
        evidence: recordSummary,
      }),
    )
  } else {
    out.push(
      f({
        id: 'dns.ns',
        title: 'Multiple nameservers configured',
        status: 'pass',
        found: `${domain} has ${ns.length} nameservers.`,
        why: 'DNS keeps working if one nameserver goes down.',
        action: 'No action needed.',
        evidence: recordSummary,
      }),
    )
  }

  // Nameserver consistency: every NS should serve the same SOA serial
  if (ns.length > 1) {
    const results = await Promise.all(
      ns.slice(0, 6).map(async (server) => {
        try {
          const ips = (await client.resolve4(server)).filter(isPublicIp)
          if (!ips.length) return { server, error: 'no public address' }
          const soa = await clientFor(ips[0]).resolveSoa(domain)
          return { server, serial: soa.serial }
        } catch (err) {
          return { server, error: errorMessage(err) }
        }
      }),
    )
    const lines = results.map((r) => `${r.server}: ${'serial' in r ? `serial ${r.serial}` : r.error}`).join('\n')
    const serials = new Set(results.filter((r) => 'serial' in r).map((r) => (r as { serial: number }).serial))
    const failed = results.filter((r) => 'error' in r)
    if (serials.size > 1) {
      out.push(
        f({
          id: 'dns.consistency',
          title: 'Nameservers return different data',
          status: 'warn',
          severity: 'medium',
          found: 'Your nameservers report different zone versions (SOA serials).',
          why: 'Visitors may get different answers depending on which nameserver they reach, causing intermittent failures.',
          action: 'Check that zone transfers or your DNS provider’s sync are working.',
          evidence: lines,
        }),
      )
    } else if (failed.length) {
      out.push(
        f({
          id: 'dns.consistency',
          title: 'Nameserver consistency not confirmed',
          status: 'unverified',
          found: `${failed.length} of ${results.length} nameservers did not answer in time.`,
          why: 'We couldn’t compare records across all nameservers.',
          action: 'Rescan later. If it persists, check the unresponsive nameserver with your DNS provider.',
          evidence: lines,
        }),
      )
    } else {
      out.push(
        f({
          id: 'dns.consistency',
          title: 'Nameservers are consistent',
          status: 'pass',
          found: 'All nameservers serve the same zone version.',
          why: 'Every visitor gets the same DNS answers.',
          action: 'No action needed.',
          evidence: lines,
        }),
      )
    }
  }

  // CAA
  try {
    const caa = await orEmpty(client.resolveCaa(domain))
    const issuers = caa.filter((r) => r.issue || r.issuewild).map((r) => r.issue ?? r.issuewild)
    out.push(
      caa.length
        ? f({
            id: 'dns.caa',
            title: 'CAA record restricts certificate issuers',
            status: 'pass',
            found: `Only ${issuers.join(', ') || 'listed authorities'} may issue certificates for ${domain}.`,
            why: 'Reduces the risk of a certificate being mis-issued for your domain.',
            action: 'No action needed. Update it if you change certificate provider.',
            evidence: caa.map((r) => `CAA ${r.critical} ${Object.entries(r).filter(([k]) => k !== 'critical').map(([k, v]) => `${k} "${v}"`).join(' ')}`).join('\n'),
          })
        : f({
            id: 'dns.caa',
            title: 'No CAA record',
            status: 'warn',
            severity: 'low',
            found: `${domain} has no CAA record, so any certificate authority may issue certificates for it.`,
            why: 'A CAA record limits which authorities can issue certificates, reducing mis-issuance risk.',
            action: 'Add a CAA record naming your certificate provider, e.g. 0 issue "letsencrypt.org".',
            evidence: `${domain} CAA: (none)`,
          }),
    )
  } catch (err) {
    out.push(
      f({
        id: 'dns.caa',
        title: 'CAA record could not be checked',
        status: 'unverified',
        found: 'The CAA lookup did not complete.',
        why: 'We can’t confirm whether certificate issuance is restricted.',
        action: 'Rescan later.',
        evidence: `${domain} CAA → ${errorMessage(err)}`,
      }),
    )
  }

  // DNSSEC (DS record at the parent + validated answer)
  try {
    const [ds, aCheck] = await Promise.all([doh(domain, 'DS'), doh(domain, 'A')])
    const dsRecords = (ds.Answer ?? []).filter((r) => r.type === 43)
    if (dsRecords.length && aCheck.AD) {
      out.push(
        f({
          id: 'dns.dnssec',
          title: 'DNSSEC enabled and validating',
          status: 'pass',
          found: 'A DS record is published and answers validate.',
          why: 'Resolvers can detect forged DNS answers for your domain.',
          action: 'No action needed. Keep keys rolled over on schedule.',
          evidence: dsRecords.map((r) => `DS ${r.data}`).join('\n'),
        }),
      )
    } else if (dsRecords.length) {
      out.push(
        f({
          id: 'dns.dnssec',
          title: 'DNSSEC configured but not validating',
          status: 'fail',
          severity: 'high',
          found: 'A DS record exists, but answers do not validate.',
          why: 'Validating resolvers may refuse to resolve your domain at all.',
          action: 'Check that the DS record at your registrar matches the DNSKEY at your DNS provider.',
          evidence: evidence(...dsRecords.map((r) => `DS ${r.data}`), `AD flag: ${aCheck.AD}`),
        }),
      )
    } else {
      out.push(
        f({
          id: 'dns.dnssec',
          title: 'DNSSEC not enabled',
          status: 'warn',
          severity: 'low',
          found: 'No DS record was found for the domain at the parent zone.',
          why: 'Without DNSSEC, forged DNS answers are harder for resolvers to detect.',
          action: 'Enable DNSSEC at your DNS provider and publish the DS record through your registrar.',
          evidence: `${domain} DS: no record`,
        }),
      )
    }
  } catch (err) {
    out.push(
      f({
        id: 'dns.dnssec',
        title: 'DNSSEC status could not be checked',
        status: 'unverified',
        found: 'The DNSSEC lookup did not complete.',
        why: 'We can’t confirm whether DNS answers are signed.',
        action: 'Rescan later.',
        evidence: `DS ${domain} → ${errorMessage(err)}`,
      }),
    )
  }

  // Dangling CNAMEs (possible subdomain takeover)
  const names = Array.from(new Set([hostname, `www.${domain}`]))
  const dangling: string[] = []
  const cnameLines: string[] = []
  for (const name of names) {
    try {
      const [cname] = await client.resolveCname(name)
      if (!cname) continue
      try {
        const ips = [...(await orEmpty(client.resolve4(cname))), ...(await orEmpty(client.resolve6(cname)))]
        cnameLines.push(`${name} CNAME ${cname} → ${ips.join(', ') || 'no address'}`)
        if (!ips.length) dangling.push(`${name} → ${cname}`)
      } catch (err) {
        cnameLines.push(`${name} CNAME ${cname} → ${errorMessage(err)}`)
        if (isNoData(err)) dangling.push(`${name} → ${cname}`)
      }
    } catch {
      // no CNAME: nothing to check
    }
  }
  if (dangling.length) {
    out.push(
      f({
        id: 'dns.dangling-cname',
        title: 'CNAME points to a missing target',
        status: 'fail',
        severity: 'high',
        confidence: 'medium',
        found: `${dangling.join(', ')} points to a name that no longer resolves.`,
        why: 'If the target belongs to a cloud service, someone else may be able to claim it and serve content on your subdomain.',
        action: 'Remove the CNAME, or re-create the resource it points to.',
        evidence: cnameLines.join('\n'),
      }),
    )
  } else if (cnameLines.length) {
    out.push(
      f({
        id: 'dns.dangling-cname',
        title: 'CNAME targets resolve',
        status: 'pass',
        found: 'The CNAME records we checked point to names that resolve.',
        why: 'No sign of abandoned DNS entries that could be taken over.',
        action: 'No action needed.',
        evidence: cnameLines.join('\n'),
      }),
    )
  }

  return out
}
