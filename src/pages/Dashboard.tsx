import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Download, Globe, KeyRound, LogOut, Menu, Plus, Radar, X } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { SeverityBadge } from '@/components/ui/badges'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'
import { useReports } from '@/hooks/useReports'
import { MODULE_ORDER, MODULE_SHORT, formatDate } from '@/lib/modules'
import { cn } from '@/lib/utils'
import logoIcon from '@/assets/logo-icon.png'
import type { ScanReport } from '@/types'

const card = 'rounded-[18px] border border-sky/12 bg-surface p-6'
const issueIds = (r?: ScanReport) => new Set(r?.findings.filter((f) => f.status === 'fail' || f.status === 'warn').map((f) => f.id) ?? [])

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { reports } = useReports()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const hostnames = useMemo(() => Array.from(new Set(reports.map((r) => r.target.hostname))), [reports])
  const [selected, setSelected] = useState<string>('')
  const host = hostnames.includes(selected) ? selected : (hostnames[0] ?? '')

  const hostReports = useMemo(() => reports.filter((r) => r.target.hostname === host), [reports, host]) // newest first
  const latest = hostReports[0]
  const previous = hostReports[1]

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? 'Your account'

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const navItems: { label: string; href: string; badge?: number; route?: boolean }[] = [
    { label: 'Overview', href: '#overview' },
    { label: 'Critical findings', href: '#findings', badge: latest ? latest.summary.bySeverity.critical + latest.summary.bySeverity.high : 0 },
    ...MODULE_ORDER.map((m) => {
      const mod = latest?.modules.find((x) => x.id === m)
      return { label: MODULE_SHORT[m], href: latest ? `/report?id=${latest.id}&module=${m}` : '#modules', badge: mod ? mod.fail + mod.warn : 0, route: !!latest }
    }),
    { label: 'Websites', href: '#sites' },
    { label: 'Scan history', href: '#history' },
    { label: 'Full report', href: latest ? `/report?id=${latest.id}` : '/report', route: true },
  ]

  const nav = (onPick?: () => void) => (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((n) => {
        const cls = 'flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14.5px] text-muted transition-all duration-200 hover:translate-x-[3px] hover:bg-sky/7 hover:text-white'
        const inner = (
          <>
            {n.label}
            {!!n.badge && <span className="ml-auto text-xs text-fail">{n.badge}</span>}
          </>
        )
        return n.route ? (
          <Link key={n.label} to={n.href} onClick={onPick} className={cls}>
            {inner}
          </Link>
        ) : (
          <a key={n.label} href={n.href} onClick={onPick} className={cls}>
            {inner}
          </a>
        )
      })}
    </nav>
  )

  const accountCard = (
    <div className="mt-4 flex items-center gap-3 rounded-[14px] border border-sky/10 bg-sky/5 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal font-display text-sm font-bold text-white">
        {displayName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{displayName}</div>
        {user?.email && <div className="truncate text-xs text-subtle">{user.email}</div>}
      </div>
      <button
        onClick={handleSignOut}
        aria-label="Sign out"
        title="Sign out"
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sky/10 hover:text-white"
      >
        <LogOut size={17} />
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-wrap bg-navy text-sky">
      {/* Mobile drawer */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={cn('fixed inset-0 z-55 bg-[rgba(5,10,30,0.6)] transition-opacity duration-400', drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
      />
      <aside
        aria-label="Mobile navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-60 w-[min(290px,86vw)] overflow-y-auto border-r border-sky/15 bg-[#0b1a4f] px-4 py-5 transition-transform duration-450 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
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
        {accountCard}
      </aside>

      {/* Desktop sidebar */}
      <aside aria-label="Main navigation" className="animate-slide-right hidden flex-[0_0_260px] border-r border-sky/10 bg-sidebar px-4 py-5.5 lg:block">
        <Logo tone="light" className="px-2 pb-6.5" />
        {nav()}
        {latest && !latest.ownershipVerified && (
          <div className="mt-7 rounded-[14px] border border-periwinkle/30 bg-royal/20 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <KeyRound size={15} /> Verify ownership
            </div>
            <p className="mt-1.5 mb-3 text-[13px] leading-normal text-muted">
              Add a DNS TXT record to {latest.target.domain} to unlock the exposure checks.
            </p>
            <Link to={`/report?id=${latest.id}#verify`} className="text-[13px] font-semibold text-sky hover:text-white">
              Get TXT record →
            </Link>
          </div>
        )}
        {accountCard}
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
              <div className="text-[13px] text-[#4a5b8c]">{latest ? `Last assessed ${formatDate(latest.completedAt)}` : 'No assessments yet'}</div>
            </div>
            {hostnames.length > 0 && (
              <>
                <label htmlFor="site" className="sr-only">
                  Website
                </label>
                <select
                  id="site"
                  value={host}
                  onChange={(e) => setSelected(e.target.value)}
                  className="h-11 max-w-full rounded-[10px] border border-navy/20 bg-white px-3.5 text-sm text-navy"
                >
                  {hostnames.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </>
            )}
            <Link to="/scan" className={buttonVariants({ size: 'md', className: 'text-sm' })}>
              <Plus size={16} strokeWidth={2.4} />
              New scan
            </Link>
          </div>
        </header>

        <main className="flex flex-col gap-5.5 p-[clamp(18px,3vw,36px)]">
          {!latest ? <EmptyState firstName={(user?.user_metadata?.full_name as string | undefined)?.trim().split(/\s+/)[0]} /> : <Overview latest={latest} previous={previous} hostReports={hostReports} reports={reports} onPick={setSelected} />}
        </main>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function EmptyState({ firstName }: { firstName?: string }) {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (url.trim()) navigate(`/scan?url=${encodeURIComponent(url.trim())}`)
  }
  return (
    <section className={cn(card, 'animate-slide-up mx-auto mt-6 w-full max-w-[720px] p-[clamp(24px,5vw,48px)] text-center')}>
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-royal">
        <Radar size={30} className="text-white" />
      </div>
      <h2 className="mt-5 text-[clamp(24px,3.5vw,32px)] text-white">{firstName ? `Welcome, ${firstName}` : 'Welcome to WebExpoSyn'}</h2>
      <p className="mx-auto mt-2 max-w-[460px] text-[15px] leading-relaxed text-muted">
        Run your first assessment. We'll check SSL/TLS, security headers, DNS, email and exposure, and explain every result.
      </p>
      <form onSubmit={submit} className="mx-auto mt-7 flex max-w-[520px] flex-wrap gap-2.5 rounded-2xl border border-sky/20 bg-navy p-2">
        <label htmlFor="first-scan" className="sr-only">
          Website address
        </label>
        <div className="flex min-w-0 flex-[1_1_220px] items-center gap-2.5 px-3">
          <Globe size={18} className="shrink-0 text-periwinkle" />
          <input
            id="first-scan"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={2048}
            inputMode="url"
            placeholder="yourwebsite.com"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent text-[15px] text-white placeholder:text-subtle focus:outline-none"
          />
        </div>
        <Button type="submit" disabled={!url.trim()}>
          Scan <ArrowRight size={16} />
        </Button>
      </form>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function Overview({
  latest,
  previous,
  hostReports,
  reports,
  onPick,
}: {
  latest: ScanReport
  previous?: ScanReport
  hostReports: ScanReport[]
  reports: ScanReport[]
  onPick: (host: string) => void
}) {
  const s = latest.summary
  const topFindings = latest.findings.filter((f) => (f.status === 'fail' || f.status === 'warn') && (f.severity === 'critical' || f.severity === 'high'))
  const otherIssues = s.fail + s.warn - topFindings.length

  // Change since the previous scan of the same site
  const now = issueIds(latest)
  const before = issueIds(previous)
  const fixed = previous ? previous.findings.filter((f) => before.has(f.id) && !now.has(f.id)) : []
  const added = previous ? [...now].filter((id) => !before.has(id)).length : 0
  const stillOpen = previous ? [...now].filter((id) => before.has(id)).length : 0

  const history = [...hostReports].reverse().slice(-6)
  const maxIssues = Math.max(1, ...history.map((h) => h.summary.fail + h.summary.warn))

  const sites = Array.from(new Set(reports.map((r) => r.target.hostname))).map((h) => reports.find((r) => r.target.hostname === h)!)

  return (
    <>
      {/* Summary */}
      <section id="overview" aria-label="Assessment summary" className={cn(card, 'animate-slide-up stagger-1 scroll-mt-24')}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg text-white">What we tested on {latest.target.hostname}</h2>
          <span className="text-[13px] text-subtle">No overall score. Every result is shown.</span>
        </div>
        <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-3">
          <Tile value={s.total} label="Checks tested" className="bg-sky/6 text-white" stagger="stagger-2" />
          <Tile value={s.pass} label="Passed" className="bg-pass/9 text-pass" stagger="stagger-3" />
          <Tile value={s.fail} label="Failed" className="bg-fail/9 text-fail" stagger="stagger-4" />
          <Tile value={s.warn} label="Warnings" className="bg-warn/9 text-warn" stagger="stagger-5" />
          <Tile value={s.unverified} label="Couldn't verify" className="bg-sky/6 text-sky" stagger="stagger-6" />
        </div>
        <div
          className="mt-4.5 flex h-3 gap-[3px] overflow-hidden rounded-full"
          role="img"
          aria-label={`${s.pass} passed, ${s.fail} failed, ${s.warn} warnings, ${s.unverified} not verified, of ${s.total} checks`}
        >
          {s.pass > 0 && <div className="grow-x bg-pass" style={{ flex: s.pass }} />}
          {s.fail > 0 && <div className="grow-x bg-fail" style={{ flex: s.fail }} />}
          {s.warn > 0 && <div className="grow-x bg-warn" style={{ flex: s.warn }} />}
          {s.unverified > 0 && <div className="grow-x bg-sky" style={{ flex: s.unverified }} />}
        </div>
      </section>

      <div className="flex flex-wrap gap-5.5">
        {/* Critical findings */}
        <section id="findings" className={cn(card, 'animate-slide-up stagger-3 min-w-0 flex-[2_1_420px] scroll-mt-24')}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg text-white">Critical &amp; high findings</h2>
            <Link to={`/report?id=${latest.id}`} className="text-sm font-semibold hover:text-white">
              View all {s.fail + s.warn} issues →
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-2.5">
            {topFindings.length === 0 ? (
              <div className="flex items-center gap-3 rounded-[14px] border border-pass/30 bg-pass/7 p-4 text-[15px] text-ink">
                <Check size={18} className="shrink-0 text-pass" />
                No critical or high-severity issues.{otherIssues > 0 && ` ${otherIssues} lower-severity issue${otherIssues > 1 ? 's' : ''} to review.`}
              </div>
            ) : (
              topFindings.slice(0, 5).map((f) => (
                <Link
                  key={f.id}
                  to={`/report?id=${latest.id}`}
                  className={cn(
                    'lift flex flex-wrap items-center gap-3.5 rounded-[14px] border p-4',
                    f.severity === 'critical' ? 'border-fail/28 bg-fail/7' : 'border-sky/12 bg-sky/4',
                  )}
                >
                  <SeverityBadge severity={f.severity} />
                  <div className="min-w-0 flex-[1_1_200px]">
                    <div className="text-[15px] font-semibold text-white">{f.title}</div>
                    <div className="line-clamp-1 text-[13px] text-muted">{f.why}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Since last scan */}
        <section className={cn(card, 'animate-slide-up stagger-4 min-w-0 flex-[1_1_280px]')}>
          <h2 className="text-lg text-white">Since last scan</h2>
          {previous ? (
            <>
              <div className="text-[13px] text-subtle">Compared with {formatDate(previous.completedAt, false)}</div>
              <div className="mt-4.5 grid grid-cols-3 gap-2.5 text-center">
                <MiniStat value={fixed.length} label="Fixed" className="bg-pass/9 text-pass" />
                <MiniStat value={added} label="New" className="bg-fail/9 text-fail" />
                <MiniStat value={stillOpen} label="Still open" className="bg-sky/6 text-white" />
              </div>
              {fixed.length > 0 && (
                <ul className="mt-4.5 flex flex-col gap-2.5 text-sm">
                  {fixed.slice(0, 4).map((f) => (
                    <li key={f.id} className="flex gap-2.5 text-ink">
                      <Check size={18} strokeWidth={2.4} className="shrink-0 text-pass" />
                      {f.title}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Scan {latest.target.hostname} again after making fixes to see what changed.
            </p>
          )}
        </section>
      </div>

      {/* Modules */}
      <section id="modules" aria-label="Modules" className="animate-slide-up stagger-5 scroll-mt-24">
        <h2 className="mb-3.5 text-lg text-white">Results by module</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          {latest.modules.map((m) => {
            const total = m.pass + m.fail + m.warn + m.unverified || 1
            const w = (n: number) => `${(n / total) * 100}%`
            return (
              <Link key={m.id} to={`/report?id=${latest.id}&module=${m.id}`} className="lift block rounded-2xl border border-sky/12 bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold text-white">{m.name}</span>
                  <span className="font-mono text-xs text-subtle">{m.pass + m.fail + m.warn + m.unverified} checks</span>
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
                {m.error && <p className="mt-2 text-xs text-warn">Didn't complete: rescan to retry</p>}
              </Link>
            )
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-5.5">
        {/* Websites */}
        <Panel id="sites" title="Websites" className="stagger-6 flex-[3_1_480px]">
          <div className="mt-3.5 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs tracking-[0.08em] text-subtle uppercase">
                  <th className="px-3 py-2.5 font-semibold">Website</th>
                  <th className="px-3 py-2.5 font-semibold">Ownership</th>
                  <th className="px-3 py-2.5 font-semibold">Last scan</th>
                  <th className="px-3 py-2.5 font-semibold">Issues</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((r) => (
                  <tr key={r.target.hostname} className="border-t border-sky/8 transition-colors hover:bg-periwinkle/7">
                    <td className="px-3 py-3.5">
                      <button onClick={() => onPick(r.target.hostname)} className="cursor-pointer font-medium text-white hover:text-periwinkle">
                        {r.target.hostname}
                      </button>
                    </td>
                    <td className={cn('px-3 py-3.5', r.ownershipVerified ? 'text-pass' : 'text-warn')}>{r.ownershipVerified ? 'Verified' : 'Not verified'}</td>
                    <td className="px-3 py-3.5 text-muted">{formatDate(r.completedAt, false)}</td>
                    <td className="px-3 py-3.5 text-fail">{r.summary.fail + r.summary.warn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* History */}
        <Panel id="history" title="Scan history" className="stagger-7 flex-[2_1_320px]">
          <div className="text-[13px] text-subtle">Issues (failed + warnings) per scan, {latest.target.hostname}</div>
          {history.length < 2 ? (
            <p className="mt-5 text-sm leading-relaxed text-muted">Your trend appears here after the second scan of this site.</p>
          ) : (
            <>
              <div className="mt-5 flex h-[140px] items-end gap-3.5" role="img" aria-label={history.map((h) => `${formatDate(h.completedAt, false)}: ${h.summary.fail + h.summary.warn} issues`).join(', ')}>
                {history.map((h, i) => {
                  const v = h.summary.fail + h.summary.warn
                  return (
                    <div key={h.id} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span className="font-display text-sm font-semibold text-white">{v}</span>
                      <div
                        className={cn('grow-y w-full max-w-12 rounded-t-lg rounded-b-[3px]', i === history.length - 1 ? 'bg-periwinkle' : 'bg-royal')}
                        style={{ height: `${Math.max(4, (v / maxIssues) * 100)}px` }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex gap-3.5">
                {history.map((h) => (
                  <span key={h.id} className="flex-1 text-center text-xs text-subtle">
                    {new Date(h.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            </>
          )}
          <Link to={`/report?id=${latest.id}`} className="mt-4.5 flex items-center justify-between rounded-xl bg-sky/6 px-3.5 py-3 text-sm hover:bg-sky/10">
            <span className="flex items-center gap-2.5 text-white">
              <Download size={18} className="text-periwinkle" />
              Latest report
            </span>
            <span className="text-subtle">{formatDate(latest.completedAt, false)}</span>
          </Link>
        </Panel>
      </div>
    </>
  )
}

function Panel({ id, title, className, children }: { id: string; title: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn(card, 'animate-slide-up min-w-0 scroll-mt-24', className)}>
      <h2 className="text-lg text-white">{title}</h2>
      {children}
    </section>
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
