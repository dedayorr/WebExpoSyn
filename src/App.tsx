import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Landing from '@/pages/Landing'
import Scan from '@/pages/Scan'
import Dashboard from '@/pages/Dashboard'
import Report from '@/pages/Report'
import NotFound from '@/pages/NotFound'

/** Scroll to the top on route change (keeps #hash links working). */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/report" element={<Report />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
