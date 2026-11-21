import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Globe, ShieldCheck } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SAMPLE_DOMAIN, scanSteps, totalChecks, totals } from '@/data/mock'
import type { CheckStatus } from '@/types'

const STEP_MS = 1500

const logColor: Record<CheckStatus | 'info', string> = {
  info: 'text-sky',
  pass: 'text-pass',
  fail: 'text-fail',
  warn: 'text-warn',
  unverified: 'text-sky',
}

/**
 * Scan-in-progress screen.
 * Currently simulated with a timer; wire `step` to real progress events
 * (e.g. Server-Sent Events from the Express scan orchestrator) later.
 */
export default function Scan() {
  const [params] = useSearchParams()
  const domain = useMemo(() => {
    const raw = params.get('url')
    if (!raw) return SAMPLE_DOMAIN
    try {
      return new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname
    } catch {
      return SAMPLE_DOMAIN
    }
  }, [params])

  const [step, setStep] = useState(0)
  const [run, setRun] = useState(0)

  useEffect(() => {
    setStep(0)
    const id = window.setInterval(() => {
      setStep((s) => {
        if (s >= scanSteps.length) {
          window.clearInterval(id)
          return s
        }
        return s + 1
      })
    }, STEP_MS)
    return () => window.clearInterval(id)
  }, [run])

  const finished = step >= scanSteps.length
  const pct = Math.round((Math.min(step, scanSteps.length) / scanSteps.length) * 100)
  const checksDone = scanSteps.slice(0, step).reduce((n, s) => n + s.checks, 0)
  const logs = scanSteps
    .slice(0, step)
    .flatMap((s) => s.log)
    .map((l, i) => ({ ...l, t: `00:${String(i + 1).padStart(2, '0')}` }))
    .slice(-12)

  return (
    <div className="min-h-screen bg-navy bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(27,44,193,0.3),transparent_70%)] text-sky">
      <AppHeader>
        <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm' })}>
          Dashboard
        </Link>
      </AppHeader>

      <main className="mx-auto max-w-[1180px] px-6 pt-12 pb-18">
        <div className="animate-slide-up stagger-1 flex flex-wrap items-center gap-6">
          <div className="relative h-18 w-18 shrink-0">
            <span aria-hidden="true" className="radar-ring absolute inset-0 rounded-full border-2 border-periwinkle" />
            <span aria-hidden="true" className="radar-ring-2 absolute inset-0 rounded-full border-2 border-periwinkle" />
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-royal">
              <Globe size={32} className="text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-[1_1_300px]">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-periwinkle">
              {finished ? 'Assessment complete' : 'Assessing security posture'}
            </p>
            <h1 className="mt-1.5 text-[clamp(28px,4vw,42px)] font-bold break-all text-white">{domain}</h1>
          </div>
          <div className="text-right">
            <div className="font-display text-[clamp(32px,5vw,48px)] font-bold text-white">{pct}%</div>
            <div className="text-[13px] text-subtle">
              {checksDone} of {totalChecks} checks
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
          <div className="progress-shimmer h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>

        <div className="mt-9 flex flex-wrap items-start gap-6">
          <ol className="animate-slide-up stagger-2 flex min-w-0 flex-[1_1_420px] flex-col gap-2.5">
            {scanSteps.map((s, i) => {
              const done = i < step
              const active = i === step
              return (
                <li
                  key={s.title}
                  className={cn(
                    'flex items-center gap-4 rounded-[14px] border px-4.5 py-4 transition-all duration-400',
                    active ? 'border-periwinkle/50 bg-royal/20' : 'border-sky/10 bg-surface',
                    !done && !active && 'opacity-55',
                  )}
                >
                  {done && (
                    <span className="animate-pop flex h-5.5 w-5.5 items-center justify-center rounded-full bg-pass">
                      <Check size={13} strokeWidth={3.2} className="text-[#05261a]" />
                    </span>
                  )}
                  {active && (
                    <span className="h-5.5 w-5.5 animate-spin rounded-full border-[2.5px] border-periwinkle/25 border-t-periwinkle" />
                  )}
                  {!done && !active && <span className="h-5.5 w-5.5 rounded-full border-2 border-dashed border-sky/30" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white">{s.title}</div>
                    <div className="mt-0.5 text-[13px] text-subtle">{s.detail}</div>
                  </div>
                  <span className="font-mono text-xs text-periwinkle">{done ? 'done' : active ? 'running' : 'queued'}</span>
                </li>
              )
            })}
          </ol>

          <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
            <div className="animate-slide-up stagger-3 overflow-hidden rounded-2xl border border-sky/12 bg-navy-deep">
              <div className="flex items-center justify-between border-b border-sky/8 px-4 py-3">
                <span className="font-mono text-xs text-subtle">scan.log</span>
                <span className="flex items-center gap-1.5 text-xs text-pass">
                  <span className="h-1.5 w-1.5 rounded-full bg-pass" />
                  {finished ? 'finished' : 'live'}
                </span>
              </div>
              <div className="flex min-h-[280px] max-h-[360px] flex-col gap-2 overflow-hidden p-4 font-mono text-[12.5px] leading-normal">
                {logs.map((l) => (
                  <div key={l.t} className="animate-slide-right flex gap-2.5">
                    <span className="shrink-0 text-[#5d74ad]">{l.t}</span>
                    <span className={logColor[l.status]}>{l.message}</span>
                  </div>
                ))}
              </div>
            </div>

            {finished && (
              <div className="animate-slide-up rounded-[18px] border border-sky/25 bg-[linear-gradient(160deg,#1B2CC1,#12207f)] p-6.5">
                <h2 className="text-2xl text-white">Assessment complete</h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">
                  {totalChecks} checks run: {totals.pass} passed, {totals.fail} failed, {totals.warn} warnings,{' '}
                  {totals.unverified} could not be verified.
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Link to="/report" className={buttonVariants({ variant: 'white', className: 'font-bold' })}>
                    View full report
                  </Link>
                  <Button variant="outlineWhite" onClick={() => setRun((r) => r + 1)}>
                    Run again
                  </Button>
                </div>
              </div>
            )}

            <div className="animate-slide-up stagger-3 flex gap-3 rounded-[14px] border border-sky/10 bg-sky/5 px-5 py-4.5 text-[13px] leading-relaxed text-muted">
              <ShieldCheck size={20} className="shrink-0 text-periwinkle" />
              <span>
                Passive checks only. To unlock deeper exposure checks, verify you own this domain with a DNS TXT
                record.
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
