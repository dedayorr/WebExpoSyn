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
