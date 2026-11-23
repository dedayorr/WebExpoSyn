import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Globe, RotateCcw, ShieldCheck } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'
import { SeverityBadge } from '@/components/ui/badges'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/auth/AuthProvider'
import { useReports } from '@/hooks/useReports'
import { ApiError, api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { ScanReport } from '@/types'

/** What the engine does, in order. Shown as progress while the API works. */
const STEPS = [
  { title: 'Validating domain', detail: 'Making sure the address is real and safe to check' },
  { title: 'Checking ownership', detail: 'Seeing if you’ve proved this website is yours' },
  { title: 'SSL/TLS analysis', detail: 'Is the padlock working, so what visitors type stays private?' },
  { title: 'HTTP security headers', detail: 'Does your site tell browsers how to protect visitors?' },
  { title: 'DNS security', detail: 'Does your web address point to the right place, safely?' },
  { title: 'Email security', detail: 'Can scammers send emails that look like they come from you?' },
  { title: 'Website exposure', detail: 'Is anything private sitting where anyone can open it?' },
  { title: 'Building your report', detail: 'Ranking issues and writing clear fixes' },
]

/** The API answers in one response, so progress is paced locally and holds on the last step. */
const STEP_MS = 1_800

type Phase = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; report: ScanReport } | { kind: 'error'; error: ApiError }

function hostnameOf(input: string) {
  try {
    return new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).hostname
  } catch {
    return input
  }
}

export default function Scan() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { addReport } = useReports()

  const urlParam = params.get('url')?.trim() ?? ''
  const dkimParam = params.get('dkim') ?? ''
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [step, setStep] = useState(0)
  const [runId, setRunId] = useState(0)
  const started = useRef<string | null>(null)

  const domain = useMemo(() => hostnameOf(urlParam), [urlParam])

  // Pace the progress list while a scan is running.
  useEffect(() => {
    if (phase.kind !== 'running') return
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS)
    return () => window.clearInterval(timer)
  }, [phase.kind])

  // Start a scan whenever ?url= is present: once per URL/run. Not cancelled on
  // effect cleanup (React dev mode runs effects twice); stale results are
  // ignored by comparing tokens instead.
  useEffect(() => {
    if (!urlParam) {
      started.current = null
      return
    }
    const token = `${urlParam}|${dkimParam}|${runId}`
    if (started.current === token) return
    started.current = token
    setPhase({ kind: 'running' })
    setStep(0)

    const selectors = dkimParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 5)
    api
      .scan(urlParam, selectors)
      .then((report) => {
        if (started.current !== token) return
        addReport(report)
        setStep(STEPS.length)
        setPhase({ kind: 'done', report })
      })
      .catch(async (err: unknown) => {
        if (started.current !== token) return
        const error = err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.')
        if (error.status === 401) {
          await signOut()
          navigate(`/login?next=${encodeURIComponent(`/scan?url=${encodeURIComponent(urlParam)}`)}`, { replace: true })
          return
        }
        setPhase({ kind: 'error', error })
      })
  }, [urlParam, dkimParam, runId, addReport, signOut, navigate])

  if (!urlParam) {
    return <ScanForm onSubmit={(url, dkim) => setParams(dkim ? { url, dkim } : { url })} />
  }

  const finished = phase.kind === 'done'
  const pct = finished ? 100 : phase.kind === 'error' ? Math.round((step / STEPS.length) * 100) : Math.min(95, Math.round(((step + 0.5) / STEPS.length) * 100))
  const report = finished ? phase.report : null
  const issues = report?.findings.filter((f) => f.status === 'fail' || f.status === 'warn') ?? []

  return (
    <div className="min-h-screen bg-navy bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(27,44,193,0.3),transparent_70%)] text-sky">
      <AppHeader>
        <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm' })}>
          Dashboard
        </Link>
      </AppHeader>

      <main className="mx-auto max-w-295 px-6 pt-12 pb-18">
        <div className="animate-slide-up stagger-1 flex flex-wrap items-center gap-6">
          <div className="relative h-18 w-18 shrink-0">
            {phase.kind === 'running' && (
              <>
                <span aria-hidden="true" className="radar-ring absolute inset-0 rounded-full border-2 border-periwinkle" />
                <span aria-hidden="true" className="radar-ring-2 absolute inset-0 rounded-full border-2 border-periwinkle" />
              </>
            )}
            <div className={cn('absolute inset-0 flex items-center justify-center rounded-full', phase.kind === 'error' ? 'bg-fail/80' : 'bg-royal')}>
              {phase.kind === 'error' ? <AlertTriangle size={30} className="text-white" /> : <Globe size={32} className="text-white" />}
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_300px]">
            <p className="text-[13px] font-semibold tracking-[0.14em] text-periwinkle uppercase">
              {finished ? 'Assessment complete' : phase.kind === 'error' ? 'Scan stopped' : 'Assessing security posture'}
            </p>
            <h1 className="mt-1.5 text-[clamp(28px,4vw,42px)] font-bold break-all text-white">{report?.target.hostname ?? domain}</h1>
          </div>
          <div className="text-right">
            <div className="font-display text-[clamp(32px,5vw,48px)] font-bold text-white">{pct}%</div>
            <div className="text-[13px] text-subtle">
              {report ? `${report.summary.total} checks in ${(report.durationMs / 1000).toFixed(1)}s` : phase.kind === 'error' ? 'Stopped' : 'Running checks…'}
            </div>
          </div>
        </div>

        <div
          className="animate-slide-up stagger-2 mt-7 h-2.5 overflow-hidden rounded-full bg-sky/10"
          role="progressbar"
          aria-label="Scan progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className={cn('h-full rounded-full', phase.kind === 'error' ? 'bg-fail' : 'progress-shimmer')} style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-9 flex flex-wrap items-start gap-6">
          <ol className="animate-slide-up stagger-2 flex min-w-0 flex-[1_1_420px] flex-col gap-2.5" aria-live="polite">
            {STEPS.map((s, i) => {
              const done = finished || i < step
              const active = phase.kind === 'running' && i === step
              const stopped = phase.kind === 'error' && i === step
              return (
                <li
                  key={s.title}
                  className={cn(
                    'flex items-center gap-4 rounded-[14px] border px-4.5 py-4 transition-all duration-400',
                    active ? 'border-periwinkle/50 bg-royal/20' : stopped ? 'border-fail/40 bg-fail/10' : 'border-sky/10 bg-surface',
                    !done && !active && !stopped && 'opacity-55',
                  )}
                >
                  {done ? (
                    <span className="animate-pop flex h-5.5 w-5.5 items-center justify-center rounded-full bg-pass">
                      <Check size={13} strokeWidth={3.2} className="text-[#05261a]" />
                    </span>
                  ) : active ? (
                    <span className="h-5.5 w-5.5 animate-spin rounded-full border-[2.5px] border-periwinkle/25 border-t-periwinkle" />
                  ) : stopped ? (
                    <AlertTriangle size={20} className="text-fail" />
                  ) : (
                    <span className="h-5.5 w-5.5 rounded-full border-2 border-dashed border-sky/30" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white">{s.title}</div>
                    <div className="mt-0.5 text-[13px] text-subtle">{s.detail}</div>
                  </div>
                  <span className="font-mono text-xs text-periwinkle">{done ? 'done' : active ? 'running' : stopped ? 'stopped' : 'queued'}</span>
                </li>
              )
            })}
          </ol>

          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
            {phase.kind === 'error' && (
              <div role="alert" className="animate-slide-up rounded-[18px] border border-fail/40 bg-fail/10 p-6.5">
                <h2 className="text-xl text-white">{errorTitle(phase.error)}</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">{phase.error.message}</p>
                {phase.error.advice && phase.error.advice.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[13px] font-semibold tracking-[0.12em] text-periwinkle uppercase">What this means &amp; what to do</p>
                    <ul className="mt-2.5 space-y-2">
                      {phase.error.advice.map((a) => (
                        <li key={a} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
                          <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-periwinkle" />
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {phase.error.retryAfter && (
                  <p className="mt-2 text-sm text-muted">You can try again in about {Math.ceil(phase.error.retryAfter / 60)} minute(s).</p>
                )}
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {phase.error.code === 'PLAN_LIMIT' && (
                    <Link to="/billing" className={buttonVariants({ variant: 'white', className: 'font-bold' })}>
                      Upgrade to Pro <ArrowRight size={16} />
                    </Link>
                  )}
                  {(phase.error.status !== 422 || phase.error.code === 'DNS_RESOLUTION_FAILED') && phase.error.code !== 'PLAN_LIMIT' && (
                    <Button onClick={() => setRunId((r) => r + 1)}>
                      <RotateCcw size={16} /> Try again
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setParams({})}>
                    Scan a different site
                  </Button>
                </div>
              </div>
            )}

            {report && (
              <div className="animate-slide-up rounded-[18px] border border-sky/25 bg-[linear-gradient(160deg,#1B2CC1,#12207f)] p-6.5">
                <h2 className="text-2xl text-white">Assessment complete</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">
                  {report.summary.total} checks run: {report.summary.pass} passed, {report.summary.fail} failed, {report.summary.warn} warnings,{' '}
                  {report.summary.unverified} could not be verified.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Link to={`/report?id=${report.id}`} className={buttonVariants({ variant: 'white', className: 'font-bold' })}>
                    View full report <ArrowRight size={16} />
                  </Link>
                  <Button variant="outlineWhite" onClick={() => setRunId((r) => r + 1)}>
                    Run again
                  </Button>
                </div>
              </div>
            )}

            <div className="animate-slide-up stagger-3 overflow-hidden rounded-2xl border border-sky/12 bg-navy-deep">
              <div className="flex items-center justify-between border-b border-sky/8 px-4 py-3">
                <span className="font-mono text-xs text-subtle">{report ? 'top issues' : 'scan.log'}</span>
                <span className={cn('flex items-center gap-1.5 text-xs', phase.kind === 'error' ? 'text-fail' : 'text-pass')}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', phase.kind === 'error' ? 'bg-fail' : 'bg-pass')} />
                  {finished ? 'finished' : phase.kind === 'error' ? 'stopped' : 'live'}
                </span>
              </div>
              <div className="flex min-h-[200px] flex-col gap-2.5 p-4 text-[13px] leading-normal">
                {report ? (
                  issues.length ? (
                    issues.slice(0, 8).map((f) => (
                      <div key={f.id} className="animate-slide-right flex items-center gap-2.5">
                        <SeverityBadge severity={f.severity} className="min-w-16 px-1.5 text-[10px]" />
                        <span className="text-ink">{f.title}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-pass">No failed checks or warnings. Nice work.</p>
                  )
                ) : (
                  STEPS.slice(0, Math.min(step + 1, STEPS.length)).map((s, i) => (
                    <div key={s.title} className="animate-slide-right flex gap-2.5 font-mono text-[12.5px]">
                      <span className="shrink-0 text-[#5d74ad]">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-sky">{s.title}…</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="animate-slide-up stagger-3 flex gap-3 rounded-[14px] border border-sky/10 bg-sky/5 px-5 py-4.5 text-[13px] leading-relaxed text-muted">
              <ShieldCheck size={20} className="shrink-0 text-periwinkle" />
              <span>Passive checks only. Verify domain ownership from your report to unlock the deeper exposure checks.</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function errorTitle(error: ApiError) {
  if (error.code === 'PLAN_LIMIT') return 'Free plan limit reached'
  if (error.code === 'AUTH_UNAVAILABLE') return 'Couldn’t confirm your sign-in'
  if (error.code === 'DOMAIN_EXPIRED') return 'This domain has expired'
  if (error.code === 'DOMAIN_NOT_REGISTERED') return 'This domain isn’t registered'
  if (error.code === 'DOMAIN_ON_HOLD') return 'This domain is suspended'
  if (error.code === 'NO_WEBSITE') return 'No website at this address'
  if (error.code === 'DOMAIN_NOT_FOUND') return 'We couldn’t find this domain'
  if (error.code === 'DNS_RESOLUTION_FAILED') return 'Couldn’t look up this domain'
  if (error.status === 422) return 'This address can’t be scanned'
  if (error.code === 'TARGET_COOLDOWN') return 'Scanned recently'
  if (error.status === 429) return 'Scan limit reached'
  if (error.status === 503) return 'Scanner busy'
  if (error.status === 504 || error.code === 'CLIENT_TIMEOUT') return 'Scan timed out'
  if (error.code === 'NETWORK') return 'Couldn’t connect'
  return 'Something went wrong'
}

function ScanForm({ onSubmit }: { onSubmit: (url: string, dkim: string) => void }) {
  const [url, setUrl] = useState('')
  const [dkim, setDkim] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = url.trim()
    if (!value || value.length > 2048) {
      setError('Enter a website address, like example.com.')
      return
    }
    const selectors = dkim.split(',').map((s) => s.trim()).filter(Boolean)
    if (selectors.length > 5 || selectors.some((s) => !/^[a-z0-9._-]{1,63}$/i.test(s))) {
      setError('DKIM selectors may only contain letters, numbers, dots, dashes and underscores (max 5).')
      return
    }
    setError(null)
    onSubmit(value, selectors.join(','))
  }

  return (
    <div className="min-h-screen bg-navy bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(27,44,193,0.3),transparent_70%)] text-sky">
      <AppHeader>
        <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm' })}>
          Dashboard
        </Link>
      </AppHeader>
      <main className="mx-auto max-w-[680px] px-6 pt-20 pb-20">
        <p className="animate-slide-up stagger-1 text-[13px] font-semibold tracking-[0.14em] text-periwinkle uppercase">New assessment</p>
        <h1 className="animate-slide-up stagger-2 mt-2 text-[clamp(30px,5vw,44px)] font-bold text-white">Which website should we check?</h1>
        <p className="animate-slide-up stagger-3 mt-3 text-base leading-relaxed text-muted">
          We'll test SSL/TLS, security headers, DNS, email authentication and public exposure, then explain every result.
        </p>
        <form onSubmit={submit} noValidate className="animate-slide-up stagger-4 mt-9 flex flex-col gap-4">
          <div className="flex flex-wrap gap-2.5 rounded-2xl border border-sky/20 bg-surface p-2">
            <label htmlFor="scan-url" className="sr-only">
              Website address
            </label>
            <div className="flex min-w-0 flex-[1_1_240px] items-center gap-2.5 px-3">
              <Globe size={20} className="shrink-0 text-periwinkle" />
              <input
                id="scan-url"
                autoFocus
                inputMode="url"
                autoComplete="url"
                maxLength={2048}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="h-12 min-w-0 flex-1 border-0 bg-transparent text-base text-white placeholder:text-subtle focus:outline-none"
              />
            </div>
            <Button type="submit" className="h-[52px] px-6 text-base">
              Start scan <ArrowRight size={18} />
            </Button>
          </div>
          {error && <p className="text-sm text-fail">{error}</p>}
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="w-fit cursor-pointer text-sm font-medium text-periwinkle hover:text-white" aria-expanded={showAdvanced}>
            {showAdvanced ? 'Hide' : 'Show'} advanced options
          </button>
          <div className="accordion" data-open={showAdvanced}>
            <div>
              <label htmlFor="dkim" className="mb-1.5 block text-sm font-medium text-ink">
                DKIM selectors (optional)
              </label>
              <input
                id="dkim"
                value={dkim}
                onChange={(e) => setDkim(e.target.value)}
                maxLength={200}
                placeholder="e.g. google, selector1"
                className="h-11 w-full rounded-[10px] border border-sky/20 bg-surface px-3.5 text-sm text-white placeholder:text-subtle focus:border-periwinkle focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-subtle">Your email provider shows this in its DKIM settings. We also try common selectors automatically.</p>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
