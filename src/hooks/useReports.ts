import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { REPORTS_EVENT, loadReports, notifyReportsChanged, removeReport, saveReport } from '@/lib/reportStore'
import { supabase } from '@/lib/supabase'
import type { ScanReport } from '@/types'

/** How many recent reports the dashboard loads. Older ones open on demand. */
const RECENT_LIMIT = 30

function isReport(value: unknown): value is ScanReport {
  const r = value as ScanReport
  return !!r && typeof r.id === 'string' && Array.isArray(r.findings) && !!r.summary && !!r.target
}

const newestFirst = (a: ScanReport, b: ScanReport) => b.completedAt.localeCompare(a.completedAt)

/**
 * The signed-in user's reports, newest first.
 *
 * Reads saved history from Supabase (Row Level Security returns only this
 * user's rows) and merges in any reports kept locally because they couldn't
 * be saved. Without Supabase (dev preview) it uses local storage only.
 */
export function useReports() {
  const { user } = useAuth()
  const userId = user?.id ?? 'local'
  const remote = !!supabase && !!user
  const [reports, setReports] = useState<ScanReport[]>(() => loadReports(userId))
  const [verifiedDomains, setVerifiedDomains] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(remote)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const local = loadReports(userId)
    if (!remote || !supabase) {
      setReports(local)
      setLoading(false)
      return
    }
    const [scans, domains] = await Promise.all([
      supabase.from('scans').select('report').order('completed_at', { ascending: false }).limit(RECENT_LIMIT),
      supabase.from('domains').select('domain, verified_at'),
    ])
    if (scans.error) {
      setError('Could not load your scan history. Showing reports saved on this device.')
      setReports(local)
    } else {
      setError(null)
      const saved = (scans.data ?? []).map((row) => row.report).filter(isReport)
      const savedIds = new Set(saved.map((r) => r.id))
      setReports([...saved, ...local.filter((r) => !savedIds.has(r.id))].sort(newestFirst))
    }
    if (!domains.error) {
      setVerifiedDomains(new Set((domains.data ?? []).filter((d) => d.verified_at).map((d) => d.domain as string)))
    }
    setLoading(false)
  }, [userId, remote])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener(REPORTS_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(REPORTS_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [refresh])

  /** Call after a scan: saved reports are reloaded, unsaved ones kept locally. */
  const addReport = useCallback(
    (report: ScanReport) => {
      if (report.persisted && remote) notifyReportsChanged()
      else saveReport(userId, report)
    },
    [userId, remote],
  )

  /** Deletes a report from history (RLS only allows deleting your own). */
  const deleteReport = useCallback(
    async (id: string) => {
      if (remote && supabase) {
        const { error: err } = await supabase.from('scans').delete().eq('id', id)
        if (err) throw new Error('Could not delete the report. Please try again.')
      }
      removeReport(userId, id)
    },
    [userId, remote],
  )

  return { reports, verifiedDomains, loading, error, addReport, deleteReport, refresh }
}

/** Loads one report: from the recent list, or directly from Supabase if it's older. */
export function useReport(id: string | null) {
  const { reports, loading, ...rest } = useReports()
  const [fetched, setFetched] = useState<ScanReport | null>(null)
  const [fetching, setFetching] = useState(false)
  const fromList = id ? reports.find((r) => r.id === id) : reports[0]

  useEffect(() => {
    if (!id || fromList || loading || !supabase) return
    let active = true
    setFetching(true)
    supabase
      .from('scans')
      .select('report')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setFetched(isReport(data?.report) ? data.report : null)
        setFetching(false)
      })
    return () => {
      active = false
    }
  }, [id, fromList, loading])

  return { report: fromList ?? (fetched?.id === id ? fetched : null), loading: loading || fetching, reports, ...rest }
}
