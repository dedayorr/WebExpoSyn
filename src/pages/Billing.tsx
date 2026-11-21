import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, CreditCard, Crown, Loader2, ShieldCheck } from 'lucide-react'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { useBilling } from '@/hooks/useBilling'
import { ApiError, api, formatNaira } from '@/lib/api'
import { formatDate } from '@/lib/modules'
import { cn } from '@/lib/utils'

const card = 'rounded-[18px] border border-sky/12 bg-surface p-6.5'

const FREE_FEATURES = ['3 websites, rescan them any time', 'All six security modules', 'PDF reports and scan comparison']
const PRO_FEATURES = ['Unlimited websites', 'All six security modules', 'PDF reports and scan comparison', 'Cancel any time']

export default function Billing() {
  const [params, setParams] = useSearchParams()
  const { billing, setBilling, loading, error, refresh } = useBilling()
  const [busy, setBusy] = useState<'checkout' | 'manage' | 'verify' | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const verified = useRef<string | null>(null)

  // Paystack sends users back here with ?reference=... after paying.
  const reference = params.get('reference') ?? params.get('trxref')
  useEffect(() => {
    if (!reference || verified.current === reference) return
    verified.current = reference
    setBusy('verify')
    api
      .verifyPayment(reference)
      .then((summary) => {
        setBilling(summary)
        setMessage(
          summary.plan === 'pro'
            ? { kind: 'ok', text: 'Payment confirmed. Welcome to WebExpoSyn Pro!' }
            : { kind: 'error', text: 'We could not confirm that payment. If you were charged, your plan will update shortly.' },
        )
      })
      .catch((err) => setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not confirm the payment.' }))
      .finally(() => {
        setBusy(null)
        setParams({}, { replace: true })
      })
  }, [reference, setBilling, setParams])

  async function go(kind: 'checkout' | 'manage') {
    setBusy(kind)
    setMessage(null)
    try {
      const url = kind === 'checkout' ? await api.checkout() : await api.manageBilling()
      window.location.assign(url)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.' })
      setBusy(null)
      if (err instanceof ApiError && err.code === 'ALREADY_PRO') void refresh()
    }
  }

  const pro = billing?.plan === 'pro'
  const price = formatNaira(billing?.priceKobo ?? 500_000)
  const limit = billing?.siteLimit ?? 3
  const used = billing?.sitesUsed ?? 0

  return (
    <div className="min-h-screen bg-navy text-sky">
      <AppHeader>
        <Link to="/dashboard" className={buttonVariants({ variant: 'light', size: 'sm' })}>
          Dashboard
        </Link>
        <Link to="/scan" className={buttonVariants({ size: 'sm' })}>
          New scan
        </Link>
      </AppHeader>

      <main className="mx-auto max-w-[1000px] px-6 py-10">
        <h1 className="animate-slide-up text-[clamp(28px,4vw,40px)] font-bold text-white">Plan &amp; billing</h1>
        <p className="animate-slide-up stagger-1 mt-2 text-muted">Free covers {limit} websites. Pro removes the limit for {price} a month.</p>

        {message && (
          <div
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'animate-slide-up mt-6 flex gap-3 rounded-[14px] border p-4 text-[15px]',
              message.kind === 'ok' ? 'border-pass/40 bg-pass/10 text-white' : 'border-fail/40 bg-fail/10 text-ink',
            )}
          >
            {message.kind === 'ok' ? <Check className="shrink-0 text-pass" size={20} /> : <AlertTriangle className="shrink-0 text-fail" size={20} />}
            {message.text}
          </div>
        )}

        {(loading || busy === 'verify') && !billing ? (
          <div className="mt-10 flex items-center gap-3 text-muted">
            <Loader2 className="animate-spin" size={20} /> {busy === 'verify' ? 'Confirming your payment…' : 'Loading your plan…'}
          </div>
        ) : error && !billing ? (
          <div role="alert" className="mt-8 rounded-[14px] border border-fail/40 bg-fail/10 p-5 text-ink">
            {error.message}
            <Button variant="ghost" size="sm" className="ml-3" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : (
          billing && (
            <>
              <section className={cn(card, 'animate-slide-up stagger-2 mt-8')} aria-label="Current plan">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-periwinkle">Current plan</p>
                    <h2 className="mt-2 flex items-center gap-2 text-2xl text-white">
                      {pro ? <Crown size={22} className="text-periwinkle" /> : <ShieldCheck size={22} className="text-periwinkle" />}
                      {pro ? 'Pro' : 'Free'}
                    </h2>
                    {pro && billing.currentPeriodEnd && (
                      <p className="mt-1.5 text-sm text-muted">
                        {billing.status === 'non_renewing' ? 'Ends' : 'Renews around'} {formatDate(billing.currentPeriodEnd)}
                        {billing.status === 'attention' && ' · last payment failed, please update your card'}
                      </p>
                    )}
                  </div>
                  {pro && billing.canManage && (
                    <Button variant="ghost" onClick={() => void go('manage')} disabled={busy !== null}>
                      {busy === 'manage' ? <Loader2 className="animate-spin" size={16} /> : <CreditCard size={16} />} Manage subscription
                    </Button>
                  )}
                </div>

                <div className="mt-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-ink">Websites</span>
                    <span className="font-mono text-white">{pro ? `${used} · unlimited` : `${used} of ${limit}`}</span>
                  </div>
                  {!pro && (
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky/10">
                      <div
                        className={cn('h-full rounded-full', used >= limit ? 'bg-fail' : 'bg-periwinkle')}
                        style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                      />
                    </div>
                  )}
                  {billing.domains.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {billing.domains.map((d) => (
                        <span key={d} className="rounded-full bg-periwinkle/15 px-3 py-1 font-mono text-[13px] text-sky">{d}</span>
                      ))}
                    </div>
                  )}
                  {!pro && used >= limit && (
                    <p className="mt-3 text-sm text-muted">
                      You can still rescan these. To add a different website, upgrade or delete an old website’s reports from its report page.
                    </p>
                  )}
                </div>
              </section>

              {!pro && (
                <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
                  <PlanCard name="Free" price="₦0" features={FREE_FEATURES} current />
                  <PlanCard name="Pro" price={price} features={PRO_FEATURES} highlight>
                    {billing.billingEnabled ? (
                      <Button variant="white" className="mt-6 w-full font-bold" onClick={() => void go('checkout')} disabled={busy !== null}>
                        {busy === 'checkout' ? <Loader2 className="animate-spin" size={16} /> : <Crown size={16} />} Upgrade to Pro
                      </Button>
                    ) : (
                      <p className="mt-6 text-sm text-ink">Upgrading isn’t available yet. Please check back soon.</p>
                    )}
                    <p className="mt-3 text-center text-xs text-ink">Secure payment by Paystack. Card, bank or USSD.</p>
                  </PlanCard>
                </div>
              )}
            </>
          )
        )}
      </main>
    </div>
  )
}

function PlanCard({
  name,
  price,
  features,
  current,
  highlight,
  children,
}: {
  name: string
  price: string
  features: string[]
  current?: boolean
  highlight?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'animate-slide-up stagger-3 rounded-[18px] border p-6.5',
        highlight ? 'border-sky/25 bg-[linear-gradient(160deg,#1B2CC1,#12207f)]' : 'border-sky/12 bg-surface',
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xl text-white">{name}</h3>
        {current && <span className="rounded-full bg-sky/10 px-3 py-1 text-xs text-sky">Your plan</span>}
      </div>
      <p className="mt-3 text-white">
        <span className="text-3xl font-bold">{price}</span>
        <span className={highlight ? 'text-ink' : 'text-muted'}> / month</span>
      </p>
      <ul className="mt-5 space-y-2.5 text-[15px]">
        {features.map((f) => (
          <li key={f} className={cn('flex gap-2.5', highlight ? 'text-white' : 'text-ink')}>
            <Check size={18} className={cn('mt-0.5 shrink-0', highlight ? 'text-sky' : 'text-periwinkle')} /> {f}
          </li>
        ))}
      </ul>
      {children}
    </div>
  )
}
