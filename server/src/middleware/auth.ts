import type { NextFunction, Request, Response } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
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
 * Verifies Supabase access tokens locally:
 * - signature checked against the project's published keys (JWKS), or the
 *   legacy HS256 secret for older projects
 * - algorithm pinned (no "none", no algorithm confusion)
 * - issuer, audience and expiry enforced
 */
export function createSupabaseVerifier(supabaseUrl: string, legacySecret?: string): TokenVerifier {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  const hsKey = legacySecret ? new TextEncoder().encode(legacySecret) : undefined

  return async (token) => {
    const options = { issuer, audience: 'authenticated', clockTolerance: 5 }
    let payload: JWTPayload
    if (hsKey) {
      ;({ payload } = await jwtVerify(token, hsKey, { ...options, algorithms: ['HS256'] }))
    } else {
      ;({ payload } = await jwtVerify(token, jwks, { ...options, algorithms: ['ES256', 'RS256'] }))
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
    } catch {
      logEvent('auth.failed', { ip: req.ip, path: req.path })
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
