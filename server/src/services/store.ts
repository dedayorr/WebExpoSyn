import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config.js'
import type { ScanReport } from '../types.js'

/**
 * Where completed scans and verified domains are saved.
 * The API is the only writer; users read their own rows through Row Level
 * Security (see supabase/migrations).
 */
export interface ScanStore {
  saveScan(userId: string, report: ScanReport): Promise<void>
  markVerified(userId: string, domain: string): Promise<void>
  /**
   * Recent scans by this user and of this hostname (by anyone). Backs the
   * rate limits with the database, because on Vercel several server
   * instances run at once and each has its own in-memory counters.
   */
  countRecent?(userId: string, hostname: string): Promise<{ byUser: number; byTarget: number }>
}

/** Scan history kept per user; older scans are pruned after each save. */
export const MAX_SCANS_PER_USER = 200

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: string) => UUID_RE.test(v)

export class SupabaseScanStore implements ScanStore {
  constructor(private db: SupabaseClient) {}

  async countRecent(userId: string, hostname: string) {
    const since = (ms: number) => new Date(Date.now() - ms).toISOString()
    const [user, target] = await Promise.all([
      this.db.from('scans').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('completed_at', since(15 * 60_000)),
      this.db.from('scans').select('id', { count: 'exact', head: true }).eq('hostname', hostname).gte('completed_at', since(10 * 60_000)),
    ])
    if (user.error || target.error) throw new Error(`countRecent: ${(user.error ?? target.error)!.message}`)
    return { byUser: user.count ?? 0, byTarget: target.count ?? 0 }
  }

  async saveScan(userId: string, report: ScanReport) {
    const { error } = await this.db.from('scans').insert({
      id: report.id,
      user_id: userId,
      hostname: report.target.hostname,
      domain: report.target.domain,
      url: report.target.url,
      ownership_verified: report.ownershipVerified,
      started_at: report.startedAt,
      completed_at: report.completedAt,
      duration_ms: report.durationMs,
      summary: report.summary,
      report,
    })
    if (error) throw new Error(`saveScan: ${error.message}`)

    const domainRow: Record<string, unknown> = { user_id: userId, domain: report.target.domain, last_scanned_at: report.completedAt }
    if (report.ownershipVerified) domainRow.verified_at = report.completedAt
    const { error: domainError } = await this.db.from('domains').upsert(domainRow, { onConflict: 'user_id,domain' })
    if (domainError) throw new Error(`saveScan domain: ${domainError.message}`)

    await this.prune(userId)
  }

  async markVerified(userId: string, domain: string) {
    const { error } = await this.db
      .from('domains')
      .upsert({ user_id: userId, domain, verified_at: new Date().toISOString() }, { onConflict: 'user_id,domain' })
    if (error) throw new Error(`markVerified: ${error.message}`)
  }

  /** Keeps storage bounded: deletes scans beyond the newest MAX_SCANS_PER_USER. */
  private async prune(userId: string) {
    const { data, error } = await this.db
      .from('scans')
      .select('id')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .range(MAX_SCANS_PER_USER, MAX_SCANS_PER_USER + 99)
    if (error || !data?.length) return
    await this.db.from('scans').delete().eq('user_id', userId).in('id', data.map((r) => r.id))
  }
}

/** Builds the store from env, or null when the secret key isn't configured. */
export function defaultStore(): ScanStore | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY) return null
  const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return new SupabaseScanStore(db)
}
