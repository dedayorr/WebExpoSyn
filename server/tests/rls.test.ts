/**
 * Runs the real Supabase migration in embedded Postgres (PGlite) with a
 * minimal stand-in for Supabase's auth schema, then checks the Row Level
 * Security rules as signed-in and anonymous users.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const migrationsDir = join(__dirname, '..', '..', 'supabase', 'migrations')
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))

const insertScan = (id: string, user: string, host: string) =>
  `insert into public.scans (id,user_id,hostname,domain,url,started_at,completed_at,duration_ms,summary,report)
   values ('${id}','${user}','${host}','${host}','https://${host}/',now(),now(),1000,'{}','{"x":1}')`

let db: PGlite

/** Runs a query as a role with an optional signed-in user id (like a Supabase JWT `sub`). */
async function as(role: 'authenticated' | 'anon', sub: string | null, query: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); set role ${role};`)
  try {
    return { ok: true as const, rows: (await db.query(query)).rows }
  } catch (err) {
    return { ok: false as const, error: (err as Error).message, rows: [] as unknown[] }
  } finally {
    await db.exec('reset role')
  }
}
const count = async (where: string) =>
  ((await db.query(`select count(*)::int as n from public.scans where ${where}`)).rows[0] as { n: number }).n

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');
  `)
  for (const sql of migrations) {
    await db.exec(sql)
    await db.exec(sql) // migrations must be safe to re-run
  }
  // The API server (like the secret key) bypasses RLS to write.
  await db.exec(insertScan('aaaaaaaa-0000-0000-0000-000000000001', A, 'a.com'))
  await db.exec(insertScan('bbbbbbbb-0000-0000-0000-000000000001', B, 'b.com'))
  await db.exec(`insert into public.domains (user_id, domain, verified_at) values ('${A}','a.com',now()), ('${B}','b.com',null)`)
}, 60_000)

describe('Row Level Security', () => {
  it('a user sees only their own scans', async () => {
    const r = await as('authenticated', A, 'select hostname from public.scans')
    expect(r.rows).toEqual([{ hostname: 'a.com' }])
  })

  it("a user cannot read another user's scans, even by filtering for them", async () => {
    const r = await as('authenticated', A, `select * from public.scans where user_id = '${B}'`)
    expect(r.rows).toHaveLength(0)
  })

  it('a user cannot insert (forge) a report', async () => {
    const r = await as('authenticated', A, insertScan('aaaaaaaa-0000-0000-0000-000000000002', A, 'forged.com'))
    expect(r.ok).toBe(false)
  })

  it('a user cannot edit their own report', async () => {
    const r = await as('authenticated', A, `update public.scans set summary = '{"fail":0}' where user_id = '${A}'`)
    expect(r.ok).toBe(false)
  })

  it("a user cannot delete another user's scans", async () => {
    await as('authenticated', A, `delete from public.scans where user_id = '${B}'`)
    expect(await count(`user_id = '${B}'`)).toBe(1)
  })

  it('a user cannot mark a domain as verified or self-verify', async () => {
    expect((await as('authenticated', A, `update public.domains set verified_at = now() where domain = 'b.com'`)).ok).toBe(false)
    expect((await as('authenticated', B, `insert into public.domains (user_id, domain, verified_at) values ('${B}','x.com',now())`)).ok).toBe(false)
  })

  it('anonymous visitors cannot read anything', async () => {
    const scans = await as('anon', null, 'select * from public.scans')
    const domains = await as('anon', null, 'select * from public.domains')
    expect(scans.ok && scans.rows.length > 0).toBe(false)
    expect(domains.ok && domains.rows.length > 0).toBe(false)
  })

  it('a token without a user id sees nothing', async () => {
    const r = await as('authenticated', null, 'select * from public.scans')
    expect(r.rows).toHaveLength(0)
  })

  it('a user can delete their own scans', async () => {
    const r = await as('authenticated', A, `delete from public.scans where user_id = '${A}'`)
    expect(r.ok).toBe(true)
    expect(await count(`user_id = '${A}'`)).toBe(0)
  })

  it("deleting an account removes that user's data", async () => {
    await db.exec(`delete from auth.users where id = '${B}'`)
    expect(await count(`user_id = '${B}'`)).toBe(0)
  })

  it('rejects oversized reports', async () => {
    const big = 'x'.repeat(1_200_000)
    await expect(
      db.exec(`insert into public.scans (id,user_id,hostname,domain,url,started_at,completed_at,duration_ms,summary,report)
        values ('cccccccc-0000-0000-0000-000000000001','${A}','big.com','big.com','https://big.com/',now(),now(),1,'{}', jsonb_build_object('pad', '${big}'))`),
    ).rejects.toThrow()
  })
})
