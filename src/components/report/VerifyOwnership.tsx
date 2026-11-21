import { useState } from 'react'
import { Check, Copy, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError, api } from '@/lib/api'
import type { VerificationInstructions } from '@/types'

/**
 * Domain ownership verification: shows the TXT record to add and checks it.
 * Verified owners unlock the controlled exposure checks on their next scan.
 */
export function VerifyOwnership({ domain, onVerified }: { domain: string; onVerified: () => void }) {
  const [info, setInfo] = useState<VerificationInstructions | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'checking' | 'verified' | 'not-yet'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    setState('loading')
    setError(null)
    try {
      setInfo(await api.verificationInstructions(domain))
      setState('idle')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the verification record.')
      setState('idle')
    }
  }

  async function check() {
    setState('checking')
    setError(null)
    try {
      const { verified } = await api.checkVerification(domain)
      setState(verified ? 'verified' : 'not-yet')
      if (verified) onVerified()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check the record.')
      setState('idle')
    }
  }

  async function copy() {
    if (!info) return
    try {
      await navigator.clipboard.writeText(info.record)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked: the value is visible to copy manually */
    }
  }

  return (
    <section id="verify" className="animate-slide-up rounded-[18px] border border-periwinkle/30 bg-royal/15 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-royal">
          {state === 'verified' ? <ShieldCheck size={22} className="text-white" /> : <KeyRound size={22} className="text-white" />}
        </div>
        <div className="min-w-0 flex-[1_1_300px]">
          <h2 className="text-lg text-white">{state === 'verified' ? 'Ownership verified' : `Verify you own ${domain}`}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {state === 'verified'
              ? 'Run a new scan to include the exposure checks: sensitive files, directory listings and public staging sites.'
              : 'Exposure checks only run for verified owners. Add one DNS TXT record to prove the domain is yours.'}
          </p>

          {state !== 'verified' && !info && (
            <Button size="sm" className="mt-4" onClick={load} disabled={state === 'loading'}>
              {state === 'loading' && <Loader2 size={15} className="animate-spin" />} Get my TXT record
            </Button>
          )}

          {info && state !== 'verified' && (
            <div className="mt-4 flex flex-col gap-3">
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink">
                <li>Open the DNS settings wherever your domain is managed (e.g. your registrar, Cloudflare or Vercel).</li>
                <li>
                  Add a <strong>TXT</strong> record on <code className="font-mono text-xs">{info.hosts[0]}</code> (host <code className="font-mono text-xs">@</code>) or on{' '}
                  <code className="font-mono text-xs">{info.hosts[1]}</code>, with this value:
                </li>
              </ol>
              <div className="flex items-center gap-2 rounded-[10px] border border-sky/15 bg-navy-deep p-2 pl-3.5">
                <code className="min-w-0 flex-1 font-mono text-[12.5px] break-all text-sky">{info.record}</code>
                <button
                  onClick={copy}
                  aria-label="Copy TXT record value"
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-sky/10 hover:text-white"
                >
                  {copied ? <Check size={16} className="text-pass" /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-xs text-subtle">DNS changes can take a few minutes to appear. You can remove the record after a future version saves your verification.</p>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" onClick={check} disabled={state === 'checking'}>
                  {state === 'checking' && <Loader2 size={15} className="animate-spin" />} Check now
                </Button>
                {state === 'not-yet' && <span className="text-sm text-warn">Not found yet. Wait a few minutes and check again.</span>}
              </div>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-fail">{error}</p>}
        </div>
      </div>
    </section>
  )
}
