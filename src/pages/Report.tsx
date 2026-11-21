import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, Download } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'
import { SeverityBadge, StatusBadge } from '@/components/ui/badges'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MODULE_LABELS, SAMPLE_DOMAIN, ASSESSED_AT, findings, severityCounts, totalChecks, totals } from '@/data/mock'
import type { CheckStatus, ModuleId } from '@/types'

type StatusFilter = 'issues' | CheckStatus
type ModuleFilter = 'all' | ModuleId

const statusFilters: { key: StatusFilter; label: string; count: number }[] = [
  { key: 'issues', label: 'Issues', count: totals.fail + totals.warn },
  { key: 'fail', label: 'Failed', count: totals.fail },
  { key: 'warn', label: 'Warnings', count: totals.warn },
  { key: 'unverified', label: "Couldn't verify", count: totals.unverified },
  { key: 'pass', label: 'Passed', count: totals.pass },
]

const moduleFilters: { key: ModuleFilter; label: string }[] = [
  { key: 'all', label: 'All modules' },
  { key: 'tls', label: 'SSL/TLS' },
  { key: 'headers', label: 'Headers' },
  { key: 'dns', label: 'DNS' },
  { key: 'email', label: 'Email' },
  { key: 'exposure', label: 'Exposure' },
]

const chip =
  'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-all duration-250 hover:-translate-y-px'

export default function Report() {
  const [status, setStatus] = useState<StatusFilter>('issues')
  const [module, setModule] = useState<ModuleFilter>('all')
  const [open, setOpen] = useState<Record<string, boolean>>({ git: true })
  const [toast, setToast] = useState(false)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const visible = useMemo(
    () =>
      findings.filter((f) => {
        const statusOk = status === 'issues' ? f.status === 'fail' || f.status === 'warn' : f.status === status
        return statusOk && (module === 'all' || f.module === module)
      }),
    [status, module],
  )

  function download() {
    // TODO: call the backend report endpoint and stream the PDF
    setToast(true)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(false), 2800)
  }

  const severityTiles = [
    { label: 'Critical', value: severityCounts.critical, color: 'text-fail', border: 'border-fail/30' },
    { label: 'High', value: severityCounts.high, color: 'text-high', border: 'border-sky/12' },
    { label: 'Medium', value: severityCounts.medium, color: 'text-warn', border: 'border-sky/12' },
    { label: 'Low', value: severityCounts.low, color: 'text-sky', border: 'border-sky/12' },
    { label: 'Passed', value: totals.pass, color: 'text-pass', border: 'border-sky/12' },
  ]

  return (
    <div className="min-h-screen bg-navy bg-[radial-gradient(ellipse_60%_40%_at_80%_0%,rgba(27,44,193,0.28),transparent_70%)] text-sky">
      <AppHeader>
        <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm', className: 'font-medium' })}>
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <Link to="/scan" className={buttonVariants({ variant: 'light', size: 'sm', className: 'font-medium' })}>
          Rescan
        </Link>
        <Button size="sm" onClick={download}>
          <Download size={16} /> Download PDF
        </Button>
      </AppHeader>

      <main className="mx-auto max-w-[1180px] px-6 pt-9 pb-20">
        <div className="animate-slide-up stagger-1">
          <p className="text-[13px] font-semibold tracking-[0.14em] text-periwinkle uppercase">Security assessment report</p>
          <h1 className="mt-2 text-[clamp(30px,5vw,48px)] font-bold break-all text-white">{SAMPLE_DOMAIN}</h1>
          <p className="mt-2.5 text-[15px] text-muted">
            Assessed {ASSESSED_AT} · {totalChecks} checks across 5 modules · Ownership verified
          </p>
        </div>

        <div className="animate-slide-up stagger-2 mt-7 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          {severityTiles.map((t) => (
            <div key={t.label} className={cn('rounded-[14px] border bg-surface p-4.5', t.border)}>
              <div className={cn('text-xs font-semibold tracking-[0.08em] uppercase', t.color)}>{t.label}</div>
              <div className="mt-1.5 font-display text-[32px] font-bold text-white">{t.value}</div>
            </div>
          ))}
        </div>

        <div className="animate-slide-up stagger-3 mt-8 flex flex-col gap-3">
          <div role="group" aria-label="Filter by result" className="flex flex-wrap gap-2">
            {statusFilters.map((f) => (
              <button
                key={f.key}
                aria-pressed={status === f.key}
                onClick={() => setStatus(f.key)}
                className={cn(
                  chip,
                  status === f.key
                    ? 'border-royal bg-royal text-white'
                    : 'border-sky/20 text-sky hover:border-periwinkle hover:text-white',
                )}
              >
                {f.label}
                <span className="font-mono text-xs opacity-80">{f.count}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Filter by module" className="flex flex-wrap gap-2">
            {moduleFilters.map((f) => (
              <button
                key={f.key}
                aria-pressed={module === f.key}
                onClick={() => setModule(f.key)}
                className={cn(
                  chip,
                  module === f.key
                    ? 'border-royal bg-royal text-white'
                    : 'border-sky/20 text-sky hover:border-periwinkle hover:text-white',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5.5 flex flex-col gap-3">
          {status === 'pass' && (
            <p className="text-[13px] text-subtle">
              Showing a sample of the {totals.pass} passed checks. The downloaded report lists them all.
            </p>
          )}

          {/* key forces the list to remount so items animate in again on filter change */}
          <div key={`${status}-${module}`} className="flex flex-col gap-3">
            {visible.map((f, i) => {
              const isOpen = !!open[f.id]
              return (
                <article
                  key={f.id}
                  className="animate-slide-up overflow-hidden rounded-2xl border border-sky/12 bg-surface transition-colors hover:border-periwinkle/45"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <button
                    onClick={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4.5 text-left transition-colors hover:bg-sky/4"
                  >
                    <SeverityBadge severity={f.severity} />
                    <span className="min-w-0 flex-[1_1_240px]">
                      <span className="block text-base font-semibold text-white">{f.title}</span>
                      <span className="mt-1 block font-mono text-xs text-subtle">
                        {MODULE_LABELS[f.module]} · Confidence: {f.confidence}
                      </span>
                    </span>
                    <StatusBadge status={f.status} />
                    <ChevronDown
                      size={20}
                      className={cn('text-periwinkle transition-transform duration-350', isOpen && 'rotate-180')}
                    />
                  </button>
                  <div className="accordion" data-open={isOpen}>
                    <div>
                      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-7 gap-y-4.5 border-t border-sky/8 px-5 pt-1 pb-5.5">
                        <Field label="What we found" className="pt-4">{f.found}</Field>
                        <Field label="Why it matters" className="pt-4">{f.why}</Field>
                        <Field label="Recommended action">{f.action}</Field>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold tracking-[0.1em] text-periwinkle uppercase">Evidence</div>
                          <pre className="mt-1.5 rounded-[10px] border border-sky/10 bg-navy-deep px-3.5 py-3 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-sky">
                            {f.evidence}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
            {visible.length === 0 && (
              <div className="rounded-2xl border border-dashed border-sky/25 px-5 py-10 text-center text-[15px] text-muted">
                No results match these filters.
              </div>
            )}
          </div>
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-subtle">
          Severity reflects context, not just whether a control is missing. Results marked "Couldn't verify" need more
          information from you, such as a DKIM selector, and are never counted as passes.
        </p>
      </main>

      <div
        role="status"
        className={cn(
          'fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3 rounded-[14px] bg-white px-4.5 py-3.5 text-sm font-semibold whitespace-nowrap text-navy shadow-[0_20px_50px_rgba(3,8,30,0.5)] transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
          toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[140%] opacity-0',
        )}
      >
        <Check size={18} strokeWidth={2.4} className="text-royal" />
        Report_21-Nov-2026.pdf is ready
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold tracking-[0.1em] text-periwinkle uppercase">{label}</div>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{children}</p>
    </div>
  )
}
