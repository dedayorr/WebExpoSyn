import type { ScanReport } from '@/types'

/**
 * Local fallback storage for scan reports, per signed-in user. Used when the
 * API couldn't save a report to Supabase, or in the dev preview without
 * Supabase. Cleared on sign-out so reports don't linger on shared computers.
 */
const PREFIX = 'wxs:reports:'
const MAX_REPORTS = 25
const EVENT = 'wxs:reports-changed'

const key = (userId: string) => `${PREFIX}${userId}`

export function loadReports(userId: string): ScanReport[] {
  try {
    const raw = localStorage.getItem(key(userId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as ScanReport[]).filter((r) => r && typeof r.id === 'string') : []
  } catch {
    return []
  }
}

export function saveReport(userId: string, report: ScanReport) {
  const next = [report, ...loadReports(userId).filter((r) => r.id !== report.id)].slice(0, MAX_REPORTS)
  try {
    localStorage.setItem(key(userId), JSON.stringify(next))
  } catch {
    // Storage full or blocked (private mode): keep only the newest few.
    try {
      localStorage.setItem(key(userId), JSON.stringify(next.slice(0, 5)))
    } catch {
      /* give up silently; the report is still shown in memory */
    }
  }
  window.dispatchEvent(new Event(EVENT))
}

export function removeReport(userId: string, id: string) {
  try {
    const current = loadReports(userId)
    const next = current.filter((r) => r.id !== id)
    if (next.length === 0) localStorage.removeItem(key(userId))
    else if (next.length !== current.length) localStorage.setItem(key(userId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT))
}

/** Ask every useReports() hook to reload (e.g. after the API saved a scan). */
export function notifyReportsChanged() {
  window.dispatchEvent(new Event(EVENT))
}

export function clearReports(userId?: string) {
  try {
    if (userId) {
      localStorage.removeItem(key(userId))
    } else {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => localStorage.removeItem(k))
    }
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT))
}

export const REPORTS_EVENT = EVENT
