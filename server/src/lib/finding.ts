import type { CheckStatus, Confidence, Finding, ModuleId, Severity } from '../types.js'

type FindingInput = Omit<Finding, 'module' | 'confidence' | 'severity'> & {
  severity?: Severity
  confidence?: Confidence
}

/**
 * Small factory so each check module writes findings the same way.
 * Passing checks default to severity "none"; unverified checks to "info".
 */
export function makeFinding(module: ModuleId) {
  return (input: FindingInput): Finding => ({
    module,
    confidence: input.status === 'unverified' ? 'n/a' : 'high',
    severity: defaultSeverity(input.status),
    ...input,
  })
}

function defaultSeverity(status: CheckStatus): Severity {
  if (status === 'pass') return 'none'
  if (status === 'unverified') return 'info'
  return 'medium'
}

/** Join evidence lines, dropping empty values. */
export function evidence(...lines: (string | undefined | null | false)[]): string {
  return lines.filter(Boolean).join('\n')
}

/**
 * Short, readable reason for evidence lines. Handles Node errno codes,
 * fetch() failures (code on `cause`) and AbortSignal timeouts, whose
 * DOMException `code` is the unhelpful number 23.
 */
export function errorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: string; code?: unknown; message?: string; cause?: { code?: unknown; message?: string } }
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return 'timed out'
    if (typeof e.code === 'string') return e.code
    if (typeof e.cause?.code === 'string') return e.cause.code
    if (e.message) return e.message
  }
  return String(err)
}
