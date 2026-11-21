import type { ScanReport } from '@/types'

/**
 * Temporary local storage for scan reports, kept per signed-in user, until
 * reports are saved in Supabase (the next build step). Cleared on sign-out
 * so reports don't linger on shared computers.
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
