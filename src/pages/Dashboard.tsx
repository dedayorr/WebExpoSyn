import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Download, Menu, Plus, X } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { SeverityBadge } from '@/components/ui/badges'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import logoIcon from '@/assets/logo-icon.png'
import {
  ASSESSED_AT,
  SAMPLE_DOMAIN,
  findings,
  fixedSinceLastScan,
  history,
  moduleSummaries,
  totalChecks,
  totals,
  websites,
} from '@/data/mock'

const navItems = [
  { label: 'Overview', badge: '' },
  { label: 'Websites', badge: '' },
  { label: 'Critical findings', badge: '3' },
  { label: 'SSL/TLS', badge: '' },
  { label: 'HTTP headers', badge: '3' },
  { label: 'DNS security', badge: '' },
  { label: 'Email security', badge: '2' },
  { label: 'Exposure', badge: '1' },
  { label: 'Scan history', badge: '' },
  { label: 'Reports', badge: '' },
]

const card = 'rounded-[18px] border border-sky/12 bg-surface p-6'

export default function Dashboard() {
  const [active, setActive] = useState('Overview')
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const topFindings = findings.filter((f) => f.severity === 'critical' || f.severity === 'high')
  const maxFailed = Math.max(...history.map((h) => h.failed))

  const nav = (onPick?: () => void) => (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((n) => (
        <button
          key={n.label}
          onClick={() => {
            setActive(n.label)
            onPick?.()
          }}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14.5px] transition-all duration-200',
            active === n.label ? 'bg-royal text-white' : 'text-muted hover:translate-x-[3px] hover:bg-sky/7 hover:text-white',
          )}
        >
          {n.label}
          {n.badge && <span className="ml-auto text-xs text-fail">{n.badge}</span>}
        </button>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen flex-wrap bg-navy text-sky">
      {/* Mobile drawer */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={cn(
          'fixed inset-0 z-[55] bg-[rgba(5,10,30,0.6)] transition-opacity duration-400',
          drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        aria-label="Mobile navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-[60] w-[min(290px,86vw)] overflow-y-auto border-r border-sky/15 bg-[#0b1a4f] px-4 py-5 transition-transform duration-450 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-1 pb-4">
          <Logo tone="light" />
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-sky/20 text-sky"
          >
            <X size={20} />
          </button>
        </div>
        {nav(() => setDrawerOpen(false))}
      </aside>

      {/* Desktop sidebar */}
      <aside
        aria-label="Main navigation"
        className="animate-slide-right hidden flex-[0_0_260px] border-r border-sky/10 bg-sidebar px-4 py-5.5 lg:block"
      >
        <Logo tone="light" className="px-2 pb-6.5" />
        {nav()}
        <div className="mt-7 rounded-[14px] border border-periwinkle/30 bg-royal/20 p-4">
          <div className="text-sm font-semibold text-white">Verify ownership</div>
          <p className="mt-1.5 mb-3 text-[13px] leading-normal text-muted">
            blog.example.org needs a DNS TXT record to unlock exposure checks.
          </p>
          <a href="#sites" className="text-[13px] font-semibold text-sky">
            Get TXT record →
          </a>
        </div>
      </aside>

      <div className="min-w-0 flex-[999_1_560px]">
        <header className="sticky top-0 z-40 border-b border-navy/10 bg-white shadow-[0_6px_24px_rgba(3,8,30,0.18)]">
          <div className="flex flex-wrap items-center gap-3 px-[clamp(16px,3vw,36px)] py-3.5">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-navy/20 text-navy lg:hidden"
            >
              <Menu size={22} />
            </button>
            <img src={logoIcon} alt="WebExpoSyn" className="h-9.5 w-auto lg:hidden" />
            <div className="min-w-0 flex-[1_1_200px]">
              <h1 className="text-2xl font-bold text-navy">Security overview</h1>
              <div className="text-[13px] text-[#4a5b8c]">Last assessed {ASSESSED_AT}</div>
            </div>
            <label htmlFor="site" className="sr-only">
              Website
            </label>
            <select
              id="site"
              className="h-11 max-w-full rounded-[10px] border border-navy/20 bg-white px-3.5 text-sm text-navy"
            >
              {websites.map((w) => (
                <option key={w.domain}>{w.domain}</option>
              ))}
            </select>
            <Link to="/scan" className={buttonVariants({ size: 'md', className: 'text-sm' })}>
              <Plus size={16} strokeWidth={2.4} />
              New scan
            </Link>
          </div>
        </header>

        <main className="flex flex-col gap-5.5 p-[clamp(18px,3vw,36px)]">
          {/* Summary */}
          <section aria-label="Assessment summary" className={cn(card, 'animate-slide-up stagger-1')}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-lg text-white">What we tested on {SAMPLE_DOMAIN}</h2>
              <span className="text-[13px] text-subtle">No overall score. Every result is shown.</span>
            </div>
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
              <Tile value={totalChecks} label="Checks tested" className="bg-sky/6 text-white" stagger="stagger-2" />
              <Tile value={totals.pass} label="Passed" className="bg-pass/9 text-pass" stagger="stagger-3" />
              <Tile value={totals.fail} label="Failed" className="bg-fail/9 text-fail" stagger="stagger-4" />
              <Tile value={totals.warn} label="Warnings" className="bg-warn/9 text-warn" stagger="stagger-5" />
              <Tile value={totals.unverified} label="Couldn't verify" className="bg-sky/6 text-sky" stagger="stagger-6" />
            </div>
            <div
              className="mt-4.5 flex h-3 gap-[3px] overflow-hidden rounded-full"
              role="img"
              aria-label={`${totals.pass} passed, ${totals.fail} failed, ${totals.warn} warnings, ${totals.unverified} not verified, of ${totalChecks} checks`}
            >
              <div className="grow-x bg-pass" style={{ flex: totals.pass }} />
              <div className="grow-x bg-fail" style={{ flex: totals.fail }} />
              <div className="grow-x bg-warn" style={{ flex: totals.warn }} />
              <div className="grow-x bg-sky" style={{ flex: totals.unverified }} />
            </div>
          </section>

          <div className="flex flex-wrap gap-5.5">
            {/* Critical findings */}
            <section className={cn(card, 'animate-slide-up stagger-3 min-w-0 flex-[2_1_420px]')}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg text-white">Critical findings</h2>
                <Link to="/report" className="text-sm font-semibold hover:text-white">
                  View all 9 issues →
                </Link>
              </div>
              <div className="mt-4 flex flex-col gap-2.5">
                {topFindings.map((f) => (
                  <Link
                    key={f.id}
                    to="/report"
                    className={cn(
                      'lift flex flex-wrap items-center gap-3.5 rounded-[14px] border p-4',
                      f.severity === 'critical' ? 'border-fail/28 bg-fail/7' : 'border-sky/12 bg-sky/4',
                    )}
                  >
                    <SeverityBadge severity={f.severity} />
                    <div className="min-w-0 flex-[1_1_200px]">
                      <div className="text-[15px] font-semibold text-white">{f.title}</div>
                      <div className="text-[13px] text-muted">{f.why}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Since last scan */}
            <section className={cn(card, 'animate-slide-up stagger-4 min-w-0 flex-[1_1_280px]')}>
              <h2 className="text-lg text-white">Since last scan</h2>
              <div className="text-[13px] text-subtle">Compared with 14 Nov 2026</div>
              <div className="mt-4.5 grid grid-cols-3 gap-2.5 text-center">
                <MiniStat value={3} label="Fixed" className="bg-pass/9 text-pass" />
                <MiniStat value={1} label="New" className="bg-fail/9 text-fail" />
                <MiniStat value={8} label="Still open" className="bg-sky/6 text-white" />
              </div>
              <ul className="mt-4.5 flex flex-col gap-2.5 text-sm">
                {fixedSinceLastScan.map((f) => (
                  <li key={f} className="flex gap-2.5 text-ink">
                    <Check size={18} strokeWidth={2.4} className="shrink-0 text-pass" />
                    {f}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Modules */}
          <section aria-label="Modules" className="animate-slide-up stagger-5">
            <h2 className="mb-3.5 text-lg text-white">Results by module</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
              {moduleSummaries.map((m) => {
                const total = m.pass + m.fail + m.warn + m.unverified
                const w = (n: number) => `${(n / total) * 100}%`
                return (
                  <Link key={m.id} to="/report" className="lift block rounded-2xl border border-sky/12 bg-surface p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[15px] font-semibold text-white">{m.name}</span>
                      <span className="font-mono text-xs text-subtle">{total} checks</span>
                    </div>
                    <div className="mt-3.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-sky/8">
                      <div className="grow-x bg-pass" style={{ width: w(m.pass) }} />
                      <div className="grow-x bg-fail" style={{ width: w(m.fail) }} />
                      <div className="grow-x bg-warn" style={{ width: w(m.warn) }} />
                      <div className="grow-x bg-sky" style={{ width: w(m.unverified) }} />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
                      <span className="text-pass">{m.pass} passed</span>
                      <span className="text-fail">{m.fail} failed</span>
                      <span className="text-warn">{m.warn} warn</span>
                      <span className="text-sky">{m.unverified} n/v</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>

          <div className="flex flex-wrap gap-5.5">
            {/* Websites */}
            <section id="sites" className={cn(card, 'animate-slide-up stagger-6 min-w-0 flex-[3_1_480px]')}>
              <h2 className="text-lg text-white">Websites</h2>
              <div className="mt-3.5 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-xs tracking-[0.08em] text-subtle uppercase">
                      <th className="px-3 py-2.5 font-semibold">Domain</th>
                      <th className="px-3 py-2.5 font-semibold">Ownership</th>
                      <th className="px-3 py-2.5 font-semibold">Last scan</th>
                      <th className="px-3 py-2.5 font-semibold">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.map((w) => (
                      <tr key={w.domain} className="border-t border-sky/8 transition-colors hover:bg-periwinkle/7">
                        <td className="px-3 py-3.5 font-medium text-white">{w.domain}</td>
                        <td className={cn('px-3 py-3.5', w.ownership === 'verified' ? 'text-pass' : 'text-warn')}>
                          {w.ownership === 'verified' ? 'Verified' : 'Pending'}
                        </td>
                        <td className="px-3 py-3.5 text-muted">{w.lastScan}</td>
                        <td className="px-3 py-3.5 text-fail">{w.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* History */}
            <section className={cn(card, 'animate-slide-up stagger-7 min-w-0 flex-[2_1_320px]')}>
              <h2 className="text-lg text-white">Scan history</h2>
              <div className="text-[13px] text-subtle">Failed checks per scan, {SAMPLE_DOMAIN}</div>
              <div
                className="mt-5 flex h-[140px] items-end gap-3.5"
                role="img"
                aria-label={history.map((h) => `${h.date}: ${h.failed} failed`).join(', ')}
              >
                {history.map((h, i) => (
                  <div key={h.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="font-display text-sm font-semibold text-white">{h.failed}</span>
                    <div
                      className={cn('grow-y w-full max-w-12 rounded-t-lg rounded-b-[3px]', i === history.length - 1 ? 'bg-periwinkle' : 'bg-royal')}
                      style={{ height: `${(h.failed / maxFailed) * 100}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-3.5">
                {history.map((h) => (
                  <span key={h.date} className="flex-1 text-center text-xs text-subtle">
                    {h.date}
                  </span>
                ))}
              </div>
              <Link
                to="/report"
                className="mt-4.5 flex items-center justify-between rounded-xl bg-sky/6 px-3.5 py-3 text-sm hover:bg-sky/10"
              >
                <span className="flex items-center gap-2.5 text-white">
                  <Download size={18} className="text-periwinkle" />
                  Report_21-Nov-2026.pdf
                </span>
                <span className="text-subtle">PDF</span>
              </Link>
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}

function Tile({ value, label, className, stagger }: { value: number; label: string; className: string; stagger: string }) {
  return (
    <div className={cn('animate-slide-up rounded-[14px] p-4', stagger, className)}>
      <div className="font-display text-[34px] font-bold">{value}</div>
      <div className="text-[13px] text-muted">{label}</div>
    </div>
  )
}

function MiniStat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className={cn('rounded-xl px-1.5 py-3.5', className)}>
      <div className="font-display text-[26px] font-bold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}
