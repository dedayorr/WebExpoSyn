import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SeverityBadge } from '@/components/ui/badges'
import heroBg from '@/assets/hero-bg.jpg'
import { totalChecks, totals } from '@/data/mock'

const previewRows = [
  { sev: 'critical' as const, text: '/.git/ directory publicly accessible', highlight: true },
  { sev: 'high' as const, text: 'DMARC policy set to p=none' },
  { sev: 'high' as const, text: 'Content-Security-Policy missing' },
  { sev: 'none' as const, text: 'Certificate valid and matches domain' },
  { sev: 'info' as const, text: 'DKIM: no selector supplied' },
]

export function Hero() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    navigate(`/scan${url ? `?url=${encodeURIComponent(url)}` : ''}`)
  }

  return (
    <section id="top" className="hero-clip relative px-6 pt-26 pb-28">
      {/* Fixed background image: stays still while the page scrolls */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 bg-[linear-gradient(100deg,rgba(9,21,64,0.95)_0%,rgba(9,21,64,0.86)_45%,rgba(9,21,64,0.6)_100%)]"
      />

      <div className="relative z-10 mx-auto flex max-w-310 flex-wrap items-center gap-14">
        <div className="min-w-0 flex-[1_1_480px]">
          {/* <div className="animate-slide-up stagger-1 inline-flex items-center gap-2.5 rounded-full border border-periwinkle/35 bg-royal/25 px-3.5 py-1.5 text-[13px] font-medium italic text-sky">
            <Lock size={15} className="text-periwinkle" />
            Website security posture &amp; exposure assessment
          </div> */}
          <h1 className="animate-slide-up stagger-2 mt-6 text-[clamp(38px,6vw,68px)] leading-[1.04] font-bold text-white">
            Enter your website. <span className="text-periwinkle">Discover weaknesses.</span> Understand what to fix.
          </h1>
          <p className="animate-slide-up stagger-3 mt-6 max-w-140 text-[clamp(17px,2vw,19px)] leading-relaxed text-sky">
            WebExpoSyn checks your SSL/TLS, security headers, DNS, email authentication and public exposure, then
            tells you exactly what passed, what failed, what we couldn't verify, and how to fix each issue.
          </p>

          <form
            onSubmit={onSubmit}
            className="animate-slide-up stagger-4 mt-9 flex max-w-145 flex-wrap gap-2.5 rounded-2xl border border-sky/20 bg-surface/90 p-2"
          >
            <label htmlFor="hero-url" className="sr-only">
              Website address
            </label>
            <div className="flex min-w-0 flex-[1_1_240px] items-center gap-2.5 px-3">
              <Globe size={20} className="shrink-0 text-periwinkle" />
              <input
                id="hero-url"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://yourwebsite.com"
                className="h-12 min-w-0 flex-1 border-0 bg-transparent text-base text-white placeholder:text-subtle focus:outline-none"
              />
            </div>
            <Button type="submit" className="h-13 px-6 text-base">
              Scan my website <ArrowRight size={18} />
            </Button>
          </form>
          <p className="animate-slide-up stagger-5 mt-3.5 flex items-center gap-2 text-[13px] text-subtle">
            <Lock size={15} />
            Passive checks only. Deeper exposure checks require domain ownership verification.
          </p>
        </div>

        {/* Animated report preview */}
        <div className="animate-slide-left stagger-4 min-w-0 flex-[1_1_420px]">
          <div className="animate-floaty relative overflow-hidden rounded-[20px] border border-sky/20 bg-[linear-gradient(180deg,#0f2061,#0b1a50)] shadow-[0_40px_80px_rgba(3,8,30,0.6)]">
            <div className="flex items-center justify-between border-b border-sky/10 px-5 py-4">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2.5 w-2.5 rounded-full bg-sky/25" />
                ))}
              </div>
              <span className="font-mono text-xs text-subtle">example-shop.com · sample</span>
            </div>
            <div className="relative flex flex-col gap-2.5 p-5">
              <div aria-hidden="true" className="scan-line" />
              <div className="mb-1.5 grid grid-cols-4 gap-2">
                <Stat value={totalChecks} label="Tested" className="bg-sky/5 text-white" delay="stagger-5" />
                <Stat value={totals.pass} label="Passed" className="bg-pass/10 text-pass" delay="stagger-6" />
                <Stat value={totals.fail} label="Failed" className="bg-fail/10 text-fail" delay="stagger-7" />
                <Stat value={totals.unverified} label="Unverified" className="bg-sky/5 text-sky" delay="stagger-8" />
              </div>
              {previewRows.map((r, i) => (
                <div
                  key={r.text}
                  className={`animate-slide-up stagger-${5 + i} flex items-center gap-3 rounded-xl px-3.5 py-3 ${
                    r.highlight ? 'border border-fail/25 bg-fail/10' : 'bg-sky/5'
                  }`}
                >
                  <SeverityBadge severity={r.sev} className="min-w-16" />
                  <span className="flex-1 text-sm text-white">{r.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Stat({ value, label, className, delay }: { value: number; label: string; className: string; delay: string }) {
  return (
    <div className={`animate-slide-up ${delay} rounded-xl p-3 ${className}`}>
      <div className="font-display text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-subtle">{label}</div>
    </div>
  )
}
