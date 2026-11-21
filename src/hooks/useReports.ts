import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { REPORTS_EVENT, loadReports, saveReport } from '@/lib/reportStore'
import type { ScanReport } from '@/types'

/** Reports for the signed-in user, newest first, kept in sync across tabs. */
export function useReports() {
  const { user } = useAuth()
  const userId = user?.id ?? 'local'
  const [reports, setReports] = useState<ScanReport[]>(() => loadReports(userId))

  useEffect(() => {
    const refresh = () => setReports(loadReports(userId))
    refresh()
    window.addEventListener(REPORTS_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(REPORTS_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [userId])

  const save = useCallback((report: ScanReport) => saveReport(userId, report), [userId])

  return { reports, save }
}
