import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { createSupabaseVerifier } from '../src/middleware/auth.js'

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
