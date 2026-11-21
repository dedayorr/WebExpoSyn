import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronDown, Download, FileSearch, Printer, RotateCcw } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'
import { VerifyOwnership } from '@/components/report/VerifyOwnership'
import { SeverityBadge, StatusBadge } from '@/components/ui/badges'
import { Button, buttonVariants } from '@/components/ui/button'
import { useReports } from '@/hooks/useReports'
import { MODULE_LABELS, MODULE_ORDER, MODULE_SHORT, formatDate } from '@/lib/modules'
import { cn } from '@/lib/utils'
import type { CheckStatus, ModuleId, ScanReport } from '@/types'

type StatusFilter = 'issues' | CheckStatus
type ModuleFilter = 'all' | ModuleId

const chip =
  'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-all duration-250 hover:-translate-y-px'

export default function Report() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { reports } = useReports()
  const id = params.get('id')
  const report = id ? reports.find((r) => r.id === id) : reports[0]

  if (!report) {
    return (
      <div className="min-h-screen bg-navy text-sky">
        <AppHeader>
          <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm', className: 'font-medium' })}>
            <ArrowLeft size={16} /> Dashboard
          </Link>
        </AppHeader>
        <main className="mx-auto grid max-w-[560px] place-items-center px-6 py-28 text-center">
          <FileSearch size={40} className="text-periwinkle" />
          <h1 className="mt-4 text-2xl font-bold text-white">{id ? 'Report not found' : 'No reports yet'}</h1>
          <p className="mt-2 text-muted">
            {id ? 'This report is no longer stored on this device.' : 'Run your first assessment to see a full report here.'}
          </p>
          <Button className="mt-7" onClick={() => navigate('/scan')}>
            Start a scan
          </Button>
        </main>
      </div>
    )
  }
  return <ReportView key={report.id} report={report} initialModule={params.get('module')} />
}

function ReportView({ report, initialModule }: { report: ScanReport; initialModule: string | null }) {
  const validModule = MODULE_ORDER.includes(initialModule as ModuleId) ? (initialModule as ModuleId) : 'all'
  const [status, setStatus] = useState<StatusFilter>('issues')
  const [module, setModule] = useState<ModuleFilter>(validModule)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  // Deep link from the dashboard: /report?id=...#verify
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#verify') document.getElementById('verify')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [hash])

  const s = report.summary
  const statusFilters: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'issues', label: 'Issues', count: s.fail + s.warn },
    { key: 'fail', label: 'Failed', count: s.fail },
    { key: 'warn', label: 'Warnings', count: s.warn },
    { key: 'unverified', label: "Couldn't verify", count: s.unverified },
    { key: 'pass', label: 'Passed', count: s.pass },
  ]
  const presentModules = MODULE_ORDER.filter((m) => report.findings.some((f) => f.module === m))

  const visible = useMemo(
    () =>
      report.findings.filter((f) => {
        const statusOk = status === 'issues' ? f.status === 'fail' || f.status === 'warn' : f.status === status
        return statusOk && (module === 'all' || f.module === module)
      }),
    [report, status, module],
  )

  // Open the most important issue by default.
  useEffect(() => {
    const first = report.findings.find((f) => f.status === 'fail' || f.status === 'warn')
    if (first) setOpen({ [first.id]: true })
  }, [report])

  function showToast(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2800)
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `webexposyn-${report.target.hostname}-${report.completedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    showToast('Report downloaded')
  }

  const severityTiles = [
    { label: 'Critical', value: s.bySeverity.critical, color: 'text-fail', border: s.bySeverity.critical ? 'border-fail/40' : 'border-sky/12' },
    { label: 'High', value: s.bySeverity.high, color: 'text-high', border: 'border-sky/12' },
    { label: 'Medium', value: s.bySeverity.medium, color: 'text-warn', border: 'border-sky/12' },
    { label: 'Low', value: s.bySeverity.low, color: 'text-sky', border: 'border-sky/12' },
    { label: 'Passed', value: s.pass, color: 'text-pass', border: 'border-sky/12' },
  ]
  const failedModules = report.modules.filter((m) => m.error)

  return (
    <div className="min-h-screen bg-navy bg-[radial-gradient(ellipse_60%_40%_at_80%_0%,rgba(27,44,193,0.28),transparent_70%)] text-sky print:bg-white print:text-black">
      <div className="print:hidden">
        <AppHeader>
          <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm', className: 'font-medium' })}>
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <Link
            to={`/scan?url=${encodeURIComponent(report.target.url)}`}
            className={buttonVariants({ variant: 'light', size: 'sm', className: 'font-medium' })}
          >
            <RotateCcw size={15} /> Rescan
          </Link>
          <Button size="sm" variant="light" className="font-medium" onClick={() => window.print()}>
            <Printer size={15} /> Print / PDF
          </Button>
          <Button size="sm" onClick={downloadJson}>
            <Download size={16} /> Download
          </Button>
        </AppHeader>
      </div>

      <main className="mx-auto max-w-295 px-6 pt-9 pb-20">
        <div className="animate-slide-up stagger-1">
          <p className="text-[13px] font-semibold tracking-[0.14em] text-periwinkle uppercase">Security assessment report</p>
          <h1 className="mt-2 text-[clamp(30px,5vw,48px)] font-bold break-all text-white print:text-black">{report.target.hostname}</h1>
          <p className="mt-2.5 text-[15px] text-muted">
            Assessed {formatDate(report.completedAt)} · {s.total} checks in {(report.durationMs / 1000).toFixed(1)}s ·{' '}
            {report.ownershipVerified ? 'Ownership verified' : 'Ownership not verified'}
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

        {failedModules.length > 0 && (
          <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink">
            {failedModules.map((m) => m.name).join(', ')} could not complete this time, so those results are marked "couldn't verify". Rescan to try again.
          </p>
        )}

        {!report.ownershipVerified && (
          <div className="mt-6 print:hidden">
            <VerifyOwnership domain={report.target.domain} onVerified={() => showToast('Verified. Rescan to run exposure checks.')} />
          </div>
        )}

        <div className="animate-slide-up stagger-3 mt-8 flex flex-col gap-3 print:hidden">
          <div role="group" aria-label="Filter by result" className="flex flex-wrap gap-2">
            {statusFilters.map((f) => (
              <button
                key={f.key}
                aria-pressed={status === f.key}
                onClick={() => setStatus(f.key)}
                className={cn(chip, status === f.key ? 'border-royal bg-royal text-white' : 'border-sky/20 text-sky hover:border-periwinkle hover:text-white')}
              >
                {f.label}
                <span className="font-mono text-xs opacity-80">{f.count}</span>
              </button>
            ))}
          </div>
          <div role="group" aria-label="Filter by module" className="flex flex-wrap gap-2">
            {(['all', ...presentModules] as ModuleFilter[]).map((m) => (
              <button
                key={m}
                aria-pressed={module === m}
                onClick={() => setModule(m)}
                className={cn(chip, module === m ? 'border-royal bg-royal text-white' : 'border-sky/20 text-sky hover:border-periwinkle hover:text-white')}
              >
                {m === 'all' ? 'All modules' : MODULE_SHORT[m]}
              </button>
            ))}
          </div>
        </div>

        <div key={`${status}-${module}`} className="mt-5.5 flex flex-col gap-3">
          {visible.map((f, i) => {
            const isOpen = !!open[f.id]
            return (
              <article
                key={f.id}
                className="animate-slide-up overflow-hidden rounded-2xl border border-sky/12 bg-surface transition-colors hover:border-periwinkle/45 print:break-inside-avoid"
                style={{ animationDelay: `${Math.min(i, 10) * 0.05}s` }}
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
                  <ChevronDown size={20} className={cn('text-periwinkle transition-transform duration-350', isOpen && 'rotate-180')} />
                </button>
                <div className="accordion" data-open={isOpen}>
                  <div>
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-x-7 gap-y-4.5 border-t border-sky/8 px-5 pt-1 pb-5.5">
                      <Field label="What we found" className="pt-4">{f.found}</Field>
                      <Field label="Why it matters" className="pt-4">{f.why}</Field>
                      <Field label="Recommended action">{f.action}</Field>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold tracking-[0.1em] text-periwinkle uppercase">Evidence</div>
                        <pre className="mt-1.5 max-h-64 overflow-auto rounded-[10px] border border-sky/10 bg-navy-deep px-3.5 py-3 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-sky">
                          {f.evidence || '(none)'}
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
              {status === 'issues' ? 'No failed checks or warnings here.' : 'No results match these filters.'}
            </div>
          )}
        </div>

        <p className="mt-8 text-[13px] leading-relaxed text-subtle">
          Severity reflects context, not just whether a control is missing. Results marked "Couldn't verify" need more information
          or a rescan, and are never counted as passes. Scanned {report.target.url} ({report.target.addresses.join(', ')}).
        </p>
      </main>

      <div
        role="status"
        className={cn(
          'fixed bottom-6 left-1/2 z-70 flex -translate-x-1/2 items-center gap-3 rounded-[14px] bg-white px-4.5 py-3.5 text-sm font-semibold whitespace-nowrap text-navy shadow-[0_20px_50px_rgba(3,8,30,0.5)] transition-all duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] print:hidden',
          toast ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[140%] opacity-0',
        )}
      >
        <Check size={18} strokeWidth={2.4} className="text-royal" />
        {toast}
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
