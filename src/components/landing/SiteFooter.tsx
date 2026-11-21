import { Link } from 'react-router-dom'
import { Logo } from '@/components/layout/Logo'

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-sky/10 bg-navy px-6 py-12">
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-8">
        <div className="max-w-[320px]">
          <Logo tone="light" />
          <p className="mt-3.5 text-sm leading-relaxed text-subtle">
            Lightweight website security posture and exposure assessment.
          </p>
        </div>
        <div className="flex flex-wrap gap-14 text-sm">
          <div className="flex flex-col gap-2.5">
            <span className="font-semibold text-white">Product</span>
            <a href="#checks" className="hover:text-white">What we check</a>
            <Link to="/report" className="hover:text-white">Sample report</Link>
            <Link to="/dashboard" className="hover:text-white">Dashboard</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="font-semibold text-white">Company</span>
            <a href="#who" className="hover:text-white">Who it's for</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#top" className="hover:text-white">Contact</a>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-[1240px] border-t border-sky/8 pt-6 text-[13px] text-subtle">
        © {new Date().getFullYear()} WebExpoSyn
      </div>
    </footer>
  )
}
