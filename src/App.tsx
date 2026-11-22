import { useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { ShieldLoader } from '@/components/ShieldLoader'
import Landing from '@/pages/Landing'
import Scan from '@/pages/Scan'
import Dashboard from '@/pages/Dashboard'
import Report from '@/pages/Report'
import Login from '@/pages/Login'
import Signup from '@/pages/Signup'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import NotFound from '@/pages/NotFound'
import Billing from '@/pages/Billing'

/** Scroll to the top on route change (keeps #hash links working). */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

/** How long the opening shield animation shows on a fresh visit. */
const INTRO_MS = 3000

/** Opening loading screen: shown once per page load, then fades out. */
function IntroLoader() {
  const [phase, setPhase] = useState<'show' | 'leaving' | 'done'>('show')
  // Hold the page's own entrance animations until the shield fades.
  useEffect(() => {
    const root = document.documentElement
    if (phase === 'show') root.classList.add('intro-active')
    else root.classList.remove('intro-active')
    return () => root.classList.remove('intro-active')
  }, [phase])

  useEffect(() => {
    const leave = window.setTimeout(() => setPhase('leaving'), INTRO_MS - 400)
    const done = window.setTimeout(() => setPhase('done'), INTRO_MS + 100)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(done)
    }
  }, [])
  if (phase === 'done') return null
  return <ShieldLoader label="Raising your shield…" leaving={phase === 'leaving'} />
}

export default function App() {
  return (
    <>
      <IntroLoader />
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/scan" element={<ProtectedRoute><Scan /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/report" element={<ProtectedRoute><Report /></ProtectedRoute>} />
        <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
