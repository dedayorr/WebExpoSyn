/**
 * Shared report types. These mirror src/types/index.ts in the frontend so the
 * UI can render API responses directly.
 */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'unverified'

/** Contextual severity. A missing control is not automatically high risk. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'none'

export type Confidence = 'high' | 'medium' | 'low' | 'n/a'

export type ModuleId = 'tls' | 'headers' | 'dns' | 'email' | 'exposure'

export interface Finding {
  /** Stable check identifier, e.g. "headers.csp". */
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
  /** Raw evidence (headers, DNS records, handshake results...). */
  evidence: string
}

export interface ModuleResult {
  id: ModuleId
  name: string
  pass: number
  fail: number
  warn: number
  unverified: number
  /** Set when the whole module could not run (timeout, network error). */
  error?: string
}

export interface ScanReport {
  id: string
  target: {
    input: string
    url: string
    hostname: string
    /** Registrable domain used for DNS and email checks, e.g. example.com for www.example.com. */
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
    bySeverity: Record<Exclude<Severity, 'none'>, number>
  }
  modules: ModuleResult[]
  findings: Finding[]
}

export const MODULE_NAMES: Record<ModuleId, string> = {
  tls: 'SSL/TLS',
  headers: 'HTTP headers',
  dns: 'DNS security',
  email: 'Email security',
  exposure: 'Website exposure',
}
