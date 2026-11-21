/**
 * Retries an operation once (by default) when it fails for a transient
 * network reason. A single dropped packet or slow handshake shouldn't turn a
 * check into "couldn't verify" on one scan and "pass" on the next.
 */
const TRANSIENT = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ETIMEOUT',
  'TIMEOUT',
  'EAI_AGAIN',
  'ECONNABORTED',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_SOCKET',
])

export function isTransient(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; name?: string; message?: string }
  if (typeof e.code === 'string' && TRANSIENT.has(e.code)) return true
  if (e.name === 'TimeoutError') return true
  return /socket hang up|timed out|timeout/i.test(e.message ?? '')
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number; shouldRetry?: (err: unknown) => boolean } = {},
): Promise<T> {
  const { retries = 1, delayMs = 400, shouldRetry = isTransient } = opts
  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err
      attempt++
      await new Promise((r) => setTimeout(r, delayMs * attempt))
    }
  }
}
