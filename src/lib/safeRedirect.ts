/**
 * Returns a safe in-app path for post-login redirects (?next=...).
 *
 * Only same-origin relative paths are allowed. Rejects absolute URLs,
 * protocol-relative "//evil.com", backslash tricks ("/\evil.com"),
 * javascript: URLs and anything that resolves to another origin. This
 * prevents open-redirect phishing after sign-in.
 */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback
  if (/[\u0000-\u001f]/.test(next)) return fallback
  try {
    const base = window.location.origin
    const resolved = new URL(next, base)
    if (resolved.origin !== base) return fallback
    // Never bounce back into the auth pages themselves.
    if (/^\/(login|signup|forgot-password|reset-password)\b/.test(resolved.pathname)) return fallback
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return fallback
  }
}
