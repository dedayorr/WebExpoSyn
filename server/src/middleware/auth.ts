import type { NextFunction, Request, Response } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import { config } from '../config.js'
import { logEvent } from '../lib/logger.js'

export interface AuthUser {
  id: string
  email?: string
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

/** Verifies a bearer token and returns the user, or throws. */
export type TokenVerifier = (token: string) => Promise<AuthUser>

/**
 * The token couldn't be checked (e.g. Supabase's signing keys couldn't be
 * fetched). Access is still refused, but the user isn't told their session
 * is over, because it may be perfectly valid.
 */
export class AuthUnavailableError extends Error {}

/** jose codes that mean "this token is bad", as opposed to "we couldn't check". */
const TOKEN_PROBLEM = /^ERR_(JWT_|JWS_|JWE_|JWK_INVALID|JWKS_NO_MATCHING_KEY|JWKS_MULTIPLE_MATCHING_KEYS|JOSE_ALG_NOT_ALLOWED|JOSE_NOT_SUPPORTED)/

export function isTokenProblem(err: unknown): boolean {
  const code = (err as { code?: unknown })?.code
  return typeof code === 'string' && TOKEN_PROBLEM.test(code)
}

/**
 * Verifies Supabase access tokens locally:
 * - signature checked against the project's published keys (JWKS), or the
 *   legacy HS256 secret for older projects
 * - algorithm pinned (no "none", no algorithm confusion)
 * - issuer, audience and expiry enforced
 */
export function createSupabaseVerifier(supabaseUrl: string, legacySecret?: string, opts: { jwks?: JWTVerifyGetKey } = {}): TokenVerifier {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
  // Generous timeout: a slow network shouldn't look like a bad token.
  const jwks = opts.jwks ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { timeoutDuration: 10_000 })
  const hsKey = legacySecret ? new TextEncoder().encode(legacySecret) : undefined

  return async (token) => {
    const options = { issuer, audience: 'authenticated', clockTolerance: 5 }
    const verifyOnce = async () =>
      hsKey
        ? (await jwtVerify(token, hsKey, { ...options, algorithms: ['HS256'] })).payload
        : (await jwtVerify(token, jwks, { ...options, algorithms: ['ES256', 'RS256'] })).payload

    let payload: JWTPayload
    try {
      payload = await verifyOnce()
    } catch (err) {
      if (isTokenProblem(err)) throw err
      // Couldn't reach Supabase for the signing keys: try once more.
      try {
        payload = await verifyOnce()
      } catch (err2) {
        if (isTokenProblem(err2)) throw err2
        throw new AuthUnavailableError(err2 instanceof Error ? err2.message : 'key fetch failed')
      }
    }
    if (!payload.sub) throw new Error('token has no subject')
    return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined }
  }
}

/**
 * Express middleware. When `verifier` is null, auth is disabled (only allowed
 * in development; config.ts refuses to start otherwise).
 */
export function requireAuth(verifier: TokenVerifier | null) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!verifier) {
      req.user = { id: 'local-dev' }
      next()
      return
    }
    const header = req.get('authorization') ?? ''
    const match = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/.exec(header)
    if (!match) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } })
      return
    }
    try {
      req.user = await verifier(match[1])
      next()
    } catch (err) {
      if (err instanceof AuthUnavailableError) {
        logEvent('auth.unavailable', { ip: req.ip, path: req.path, reason: err.message })
        res.status(503).json({
          error: { code: 'AUTH_UNAVAILABLE', message: "We couldn't confirm your sign-in just now. Please try again in a moment." },
        })
        return
      }
      // Log why (never the token itself), e.g. ERR_JWT_EXPIRED.
      logEvent('auth.failed', { ip: req.ip, path: req.path, reason: (err as { code?: string })?.code ?? 'invalid' })
      // Same message for expired, forged or malformed tokens.
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Your session has expired. Please sign in again.' } })
    }
  }
}

export function defaultVerifier(): TokenVerifier | null {
  if (config.AUTH_MODE === 'disabled') return null
  if (!config.SUPABASE_URL) return null
  return createSupabaseVerifier(config.SUPABASE_URL, config.SUPABASE_JWT_SECRET)
}
