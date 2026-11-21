import crypto from 'node:crypto'
import { runDnsChecks } from '../checks/dns.js'
import { runEmailChecks } from '../checks/email.js'
import { runExposureChecks } from '../checks/exposure.js'
import { runHeaderChecks } from '../checks/headersRunner.js'
import { runTlsChecks } from '../checks/tls.js'
import { errorMessage, makeFinding } from '../lib/finding.js'
import { validateTarget, type LookupAll, type ResolvedTarget } from '../lib/target.js'
import { MODULE_NAMES, type Finding, type ModuleId, type ModuleResult, type ScanReport, type Severity } from '../types.js'

export interface ScanOptions {
  dkimSelectors?: string[]
  /** Per-module time budget. */
  moduleTimeoutMs?: number
  lookupAll?: LookupAll
  /** Override module runners (tests). */
  runners?: Partial<Record<ModuleId, (t: ResolvedTarget, ctx: { ownershipVerified: boolean }) => Promise<Finding[]>>>
  verifyOwnership?: (domain: string) => Promise<boolean>
}

const STATUS_ORDER = { fail: 0, warn: 1, unverified: 2, pass: 3 } as const
const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4, none: 5 }

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * The assessment workflow:
 *   1. validate the submitted URL (syntax, ports, public DNS only)
 *   2. check domain ownership (gates the exposure module)
 *   3. gather information and run every module in parallel, each with a time budget
 *   4. classify: each finding already carries status, severity, confidence and evidence
 *   5. assemble the report: what was tested, passed, failed and couldn't be verified
 */
export async function runScan(input: string, opts: ScanOptions = {}): Promise<ScanReport> {
  const started = Date.now()
  const target = await validateTarget(input, opts.lookupAll)
  // Ownership is per user, so the caller supplies the check. Without one
  // (e.g. the CLI) the domain is treated as unverified and exposure checks stay off.
  const ownershipVerified = opts.verifyOwnership ? await opts.verifyOwnership(target.domain).catch(() => false) : false
  const moduleTimeoutMs = opts.moduleTimeoutMs ?? 30_000

  const runners: Record<ModuleId, (t: ResolvedTarget, ctx: { ownershipVerified: boolean }) => Promise<Finding[]>> = {
    tls: (t) => runTlsChecks(t),
    headers: (t) => runHeaderChecks(t),
    dns: (t) => runDnsChecks(t.domain, t.hostname),
    email: (t) => runEmailChecks(t.domain, { dkimSelectors: opts.dkimSelectors }),
    exposure: (t, ctx) => runExposureChecks(t, { ownershipVerified: ctx.ownershipVerified }),
    ...opts.runners,
  }

  const moduleIds = Object.keys(MODULE_NAMES) as ModuleId[]
  const settled = await Promise.allSettled(
    moduleIds.map((id) => withTimeout(runners[id](target, { ownershipVerified }), moduleTimeoutMs, MODULE_NAMES[id])),
  )

  const findings: Finding[] = []
  const moduleErrors: Partial<Record<ModuleId, string>> = {}
  settled.forEach((r, i) => {
    const id = moduleIds[i]
    if (r.status === 'fulfilled') {
      findings.push(...r.value)
    } else {
      moduleErrors[id] = errorMessage(r.reason)
      findings.push(
        makeFinding(id)({
          id: `${id}.module-error`,
          title: `${MODULE_NAMES[id]} checks could not complete`,
          status: 'unverified',
          found: 'This part of the assessment did not finish.',
          why: 'Results for this module are missing, so they are not counted as passes.',
          action: 'Rescan in a few minutes.',
          evidence: moduleErrors[id]!,
        }),
      )
    }
  })

  // Exposure findings from the header module (server info) are merged in
  // automatically because every finding carries its own module id.
  findings.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.module.localeCompare(b.module),
  )

  const modules: ModuleResult[] = moduleIds.map((id) => {
    const mine = findings.filter((x) => x.module === id)
    return {
      id,
      name: MODULE_NAMES[id],
      pass: mine.filter((x) => x.status === 'pass').length,
      fail: mine.filter((x) => x.status === 'fail').length,
      warn: mine.filter((x) => x.status === 'warn').length,
      unverified: mine.filter((x) => x.status === 'unverified').length,
      ...(moduleErrors[id] ? { error: moduleErrors[id] } : {}),
    }
  })

  const count = (s: Finding['status']) => findings.filter((x) => x.status === s).length
  const issues = findings.filter((x) => x.status === 'fail' || x.status === 'warn')
  const sev = (s: Severity) => issues.filter((x) => x.severity === s).length
  const completed = Date.now()

  return {
    id: crypto.randomUUID(),
    target: {
      input,
      url: target.url.toString(),
      hostname: target.hostname,
      domain: target.domain,
      addresses: target.addresses.map((a) => a.address),
    },
    ownershipVerified,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date(completed).toISOString(),
    durationMs: completed - started,
    summary: {
      total: findings.length,
      pass: count('pass'),
      fail: count('fail'),
      warn: count('warn'),
      unverified: count('unverified'),
      bySeverity: { critical: sev('critical'), high: sev('high'), medium: sev('medium'), low: sev('low'), info: sev('info') },
    },
    modules,
    findings,
  }
}
