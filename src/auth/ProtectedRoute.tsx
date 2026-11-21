import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'

/**
 * Client-side route guard for signed-in pages.
 *
 * This only controls what the UI shows. The real protection is on the API,
 * which verifies the Supabase token on every request (server/src/middleware/auth.ts).
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth()
  const location = useLocation()

  if (!configured) {
    // Local design preview without Supabase: allow, with a visible banner.
    if (import.meta.env.DEV) {
      return (
        <>
          <div className="fixed bottom-4 left-4 z-[80] flex items-center gap-2 rounded-xl bg-warn px-3.5 py-2 text-xs font-semibold text-[#2a1f05] shadow-lg">
            <ShieldAlert size={15} /> Dev preview: authentication not configured
          </div>
          {children}
        </>
      )
    }
    // Production without auth configured: fail closed.
    return (
      <main className="grid min-h-screen place-items-center bg-navy px-6 text-center text-sky">
        <div>
          <ShieldAlert size={36} className="mx-auto text-warn" />
          <h1 className="mt-4 text-2xl font-bold text-white">Sign-in is unavailable</h1>
          <p className="mt-2 text-muted">Authentication has not been configured for this site yet.</p>
        </div>
      </main>
    )
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-navy" role="status" aria-label="Loading">
        <Loader2 className="animate-spin text-periwinkle" size={32} />
      </div>
    )
  }

  if (!session) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }

  return <>{children}</>
}
