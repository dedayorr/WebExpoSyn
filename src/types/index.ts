/** Result of a single security check. */
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'unverified'

/** Contextual severity. A missing control is not automatically high risk. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none'

export type Confidence = 'high' | 'medium' | 'low' | 'n/a'

export type ModuleId = 'tls' | 'headers' | 'dns' | 'email' | 'exposure'

export interface Finding {
  id: string
  title: string
  module: ModuleId
  status: CheckStatus
  severity: Severity
  confidence: Confidence
  /** What we observed. */
  found: string
  /** Why it matters, in plain English. */
  why: string
  /** What the site owner should do. */
  action: string
  /** Raw evidence (request/response, DNS record...). */
  evidence: string
}

export interface ModuleSummary {
  id: ModuleId
  name: string
  pass: number
  fail: number
  warn: number
  unverified: number
}

export interface ScanStep {
  title: string
  detail: string
  checks: number
  log: { message: string; status: CheckStatus | 'info' }[]
}

export interface Website {
  domain: string
  ownership: 'verified' | 'pending'
  lastScan: string
  failed: number
}

export interface HistoryPoint {
  date: string
  failed: number
}

/* ------------------------------------------------------------------ */
/* API report types (mirror server/src/types.ts)                       */
/* ------------------------------------------------------------------ */

export interface ModuleResult extends ModuleSummary {
  /** Set when the whole module could not run (timeout, network error). */
  error?: string
}

export interface ScanReport {
  id: string
  target: {
    input: string
    url: string
    hostname: string
    /** Registrable domain used for DNS and email checks. */
    domain: string
    addresses: string[]
  }
  ownershipVerified: boolean
  startedAt: string
  completedAt: string
  durationMs: number
  summary: {
    total: number
    pass: number
    fail: number
    warn: number
    unverified: number
    bySeverity: Record<'critical' | 'high' | 'medium' | 'low' | 'info', number>
  }
  modules: ModuleResult[]
  findings: Finding[]
  /** True when the API saved the report to the user's history. */
  persisted?: boolean
}

export interface VerificationInstructions {
  domain: string
  record: string
  hosts: string[]
  instructions: string
}
