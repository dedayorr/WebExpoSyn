import { SignJWT, errors, generateKeyPair } from 'jose'
import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { AuthUnavailableError, createSupabaseVerifier, requireAuth } from '../src/middleware/auth.js'

const SUPABASE_URL = 'https://abcd.supabase.co'
const SECRET = 'legacy-hs256-secret-for-tests-only-0123456789'
const key = new TextEncoder().encode(SECRET)

async function token(overrides: { iss?: string; aud?: string; exp?: string | number; sub?: string; secret?: Uint8Array } = {}) {
  const jwt = new SignJWT({ email: 'dayo@example.com', role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(overrides.iss ?? `${SUPABASE_URL}/auth/v1`)
    .setAudience(overrides.aud ?? 'authenticated')
    .setExpirationTime(overrides.exp ?? '1h')
  if (overrides.sub !== '') jwt.setSubject(overrides.sub ?? 'user-123')
  return jwt.sign(overrides.secret ?? key)
}

describe('Supabase token verification', () => {
  const verify = createSupabaseVerifier(SUPABASE_URL, SECRET)

  it('accepts a valid token', async () => {
    expect(await verify(await token())).toEqual({ id: 'user-123', email: 'dayo@example.com' })
  })

  it('rejects a token signed with another key', async () => {
    await expect(verify(await token({ secret: new TextEncoder().encode('attacker-secret-attacker-secret-1234') }))).rejects.toThrow()
  })

  it('rejects an expired token', async () => {
    await expect(verify(await token({ exp: Math.floor(Date.now() / 1000) - 60 }))).rejects.toThrow()
  })

  it('rejects a token from another issuer', async () => {
    await expect(verify(await token({ iss: 'https://evil.supabase.co/auth/v1' }))).rejects.toThrow()
  })

  it('rejects a token for another audience (e.g. anon key)', async () => {
    await expect(verify(await token({ aud: 'anon' }))).rejects.toThrow()
  })

  it('rejects a token without a subject', async () => {
    await expect(verify(await token({ sub: '' }))).rejects.toThrow()
  })

  it('rejects unsigned "alg: none" tokens', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
      sub: 'user-123',
      aud: 'authenticated',
      iss: `${SUPABASE_URL}/auth/v1`,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.`
    await expect(verify(unsigned)).rejects.toThrow()
  })
})

describe('when signing keys cannot be fetched', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const esToken = () =>
    new SignJWT({ email: 'dayo@example.com' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
      .setIssuedAt()
      .setIssuer(`${SUPABASE_URL}/auth/v1`)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .setSubject('user-123')
      .sign(privateKey)
  const unreachable = async () => {
    throw new errors.JWKSTimeout()
  }
  const verify = createSupabaseVerifier(SUPABASE_URL, undefined, { jwks: unreachable })

  it('reports "unavailable" instead of "bad token"', async () => {
    await expect(verify(await esToken())).rejects.toBeInstanceOf(AuthUnavailableError)
  })

  it('retries once, so a single network blip still succeeds', async () => {
    let calls = 0
    const flaky = async () => {
      calls++
      if (calls === 1) throw new TypeError('fetch failed')
      return publicKey
    }
    const v = createSupabaseVerifier(SUPABASE_URL, undefined, { jwks: flaky })
    expect(await v(await esToken())).toEqual({ id: 'user-123', email: 'dayo@example.com' })
    expect(calls).toBe(2)
  })

  it('does not retry a forged token', async () => {
    const other = await generateKeyPair('ES256')
    let calls = 0
    const v = createSupabaseVerifier(SUPABASE_URL, undefined, {
      jwks: async () => {
        calls++
        return other.publicKey
      },
    })
    await expect(v(await esToken())).rejects.not.toBeInstanceOf(AuthUnavailableError)
    expect(calls).toBe(1)
  })

  it('answers 503 (not 401) so the app does not sign the user out', async () => {
    const app = express()
    app.get('/x', requireAuth(verify), (_req, res) => res.json({ ok: true }))
    const res = await request(app).get('/x').set('Authorization', `Bearer ${await esToken()}`)
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('AUTH_UNAVAILABLE')
  })

  it('still answers 401 for an expired token', async () => {
    const app = express()
    app.get('/x', requireAuth(createSupabaseVerifier(SUPABASE_URL, SECRET)), (_req, res) => res.json({ ok: true }))
    const res = await request(app).get('/x').set('Authorization', `Bearer ${await token({ exp: Math.floor(Date.now() / 1000) - 60 })}`)
    expect(res.status).toBe(401)
  })
})
