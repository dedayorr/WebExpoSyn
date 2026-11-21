/**
 * Structured security event log (one JSON object per line on stdout), so
 * hosting platforms and log tools can index and alert on it.
 *
 * JSON encoding escapes newlines and control characters, which prevents log
 * injection from user-supplied values such as the scanned URL. Never pass
 * tokens, passwords or response bodies here.
 */
export type SecurityEvent =
  | 'scan.completed'
  | 'scan.failed'
  | 'scan.timeout'
  | 'scan.rejected_target'
  | 'scan.rate_limited'
  | 'scan.target_cooldown'
  | 'scan.busy'
  | 'auth.failed'
  | 'verification.checked'
  | 'verification.persist_failed'
  | 'scan.persist_failed'
  | 'scan.plan_limit'
  | 'billing.usage_failed'
  | 'billing.webhook'
  | 'billing.webhook_bad_signature'
  | 'billing.webhook_unmatched'
  | 'billing.webhook_failed'
  | 'billing.checkout_started'
  | 'billing.verify_wrong_user'
  | 'billing.verify_not_paid'
  | 'billing.subscription_lookup_failed'
  | 'billing.upgraded'

export function logEvent(event: SecurityEvent, fields: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'test') return
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    safe[k] = typeof v === 'string' ? v.slice(0, 300) : v
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event, ...safe }))
}
