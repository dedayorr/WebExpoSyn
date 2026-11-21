import { Link } from 'react-router-dom'
import { ArrowRight, Check, CircleHelp, ListChecks, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import responsibleBg from '@/assets/responsible-bg.jpg'
import tlsImg from '@/assets/modules/tls.svg'
import headersImg from '@/assets/modules/headers.svg'
import dnsImg from '@/assets/modules/dns.svg'
import emailImg from '@/assets/modules/email.svg'
import exposureImg from '@/assets/modules/exposure.svg'
import reportsImg from '@/assets/modules/reports.svg'

/* ---------- Shared bits ---------- */

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.14em] text-periwinkle">{children}</p>
}

function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn('mt-3.5 text-[clamp(30px,4vw,46px)] leading-[1.1] font-bold text-white', className)}>{children}</h2>
  )
}

const card = 'rounded-[18px] border border-sky/12 bg-surface'

/* ---------- Module strip ---------- */

const strip = ['SSL/TLS', 'HTTP headers', 'DNS security', 'Email security', 'Exposure checks', 'Reports & monitoring']

export function ModuleStrip() {
  return (
    <section className="relative z-10 bg-navy px-6 pt-12 pb-12">
      <div className="reveal mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-px overflow-hidden rounded-2xl border border-sky/12 bg-sky/12">
        {strip.map((label, i) => (
          <div key={label} className="flex items-center gap-3 bg-[#0b1a4f] p-5">
            <span className="font-display text-[15px] font-semibold text-periwinkle">0{i + 1}</span>
            <span className="text-[15px] text-white">{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- No vanity scores ---------- */

const principles = [
  { icon: ListChecks, tint: 'bg-periwinkle/15 text-periwinkle', title: 'What was tested', text: 'Every check we ran, listed by module, so you know the scope of the assessment.' },
  { icon: Check, tint: 'bg-pass/12 text-pass', title: 'What passed', text: 'Configuration that already meets recognised guidance, with the evidence we observed.' },
  { icon: X, tint: 'bg-fail/12 text-fail', title: 'What failed', text: 'Weaknesses ranked by contextual severity, each with why it matters and how to fix it.' },
  { icon: CircleHelp, tint: 'bg-sky/10 text-sky', title: "What we couldn't verify", text: 'Checks that need more information, such as a DKIM selector, clearly marked rather than guessed.' },
]

export function Principles() {
  return (
    <section className="relative z-10 bg-navy px-6 py-20">
      <div className="mx-auto max-w-[1240px]">
        <div className="reveal max-w-[760px]">
          <Eyebrow>No vanity scores</Eyebrow>
          <SectionTitle>We won't tell you you're "85% secure."</SectionTitle>
          <p className="mt-4.5 text-lg leading-relaxed text-sky">
            A single number hides what matters. Every WebExpoSyn report shows exactly what we tested and where each
            result came from.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
          {principles.map(({ icon: Icon, tint, title, text }) => (
            <div key={title} className={cn('reveal lift p-7', card)}>
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', tint)}>
                <Icon size={24} />
              </div>
              <h3 className="mt-5 text-[21px] text-white">{title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Six modules ---------- */

const modules = [
  { img: tlsImg, alt: 'Browser address bar with a padlock beside a valid TLS certificate', title: 'SSL/TLS analysis', items: ['HTTPS enabled and enforced', 'Certificate validity and expiry', 'Certificate matches the domain', 'Supported TLS versions and configuration'] },
  { img: headersImg, alt: 'HTTP response with security headers checked beside a shield', title: 'HTTP security headers', items: ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options, X-Frame-Options', 'Referrer-Policy, Permissions-Policy'] },
  { img: dnsImg, alt: 'Globe connected to NS, CAA and DNSSEC record checks', title: 'DNS security', items: ['DNS records and nameserver setup', 'CAA records', 'DNSSEC status', 'Suspicious or inconsistent configuration'] },
  { img: emailImg, alt: 'Envelope protected by a shield with SPF, DKIM and DMARC results', title: 'Email security', items: ['SPF presence and syntax', 'DMARC policy configuration', 'DKIM, when you supply a selector', 'Email spoofing weaknesses'] },
  { img: exposureImg, alt: 'File paths checked for exposure, with an exposed .git folder flagged', title: 'Website exposure', items: ['Publicly accessible sensitive files', 'Exposed directory listings', 'Public staging or dev environments', 'Server information disclosure'] },
  { img: reportsImg, alt: 'Assessment report with a trend chart and findings grouped by severity', title: 'Reports & monitoring', items: ['Findings grouped by severity', 'Compare current and previous scans', 'Track whether issues were fixed', 'Downloadable PDF reports'] },
]

export function Modules() {
  return (
    <section id="checks" className="relative z-10 bg-navy bg-[linear-gradient(180deg,transparent,rgba(27,44,193,0.12),transparent)] px-6 py-20">
      <div className="mx-auto max-w-[1240px]">
        <div className="reveal flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <Eyebrow>What we check</Eyebrow>
            <SectionTitle>Six modules. One clear picture.</SectionTitle>
          </div>
          <p className="max-w-[420px] text-base leading-relaxed text-muted">
            Lightweight, controlled checks, not unrestricted vulnerability scanning.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-4.5">
          {modules.map((m, i) => (
            <article key={m.title} className="reveal lift overflow-hidden rounded-[20px] border border-sky/12 bg-surface">
              <div className="relative aspect-video overflow-hidden border-b border-sky/10">
                <img src={m.img} alt={m.alt} loading="lazy" className="zoom-img block h-full w-full object-cover" />
                <span className="absolute top-3.5 left-3.5 rounded-lg bg-navy/85 px-2.5 py-1 font-mono text-xs text-sky">
                  MODULE 0{i + 1}
                </span>
              </div>
              <div className="p-7 pt-6">
                <h3 className="text-[22px] text-white">{m.title}</h3>
                <ul className="mt-3.5 flex flex-col gap-2 text-[15px] text-muted">
                  {m.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- How it works ---------- */

const steps = [
  { title: 'Submit domain', text: 'Enter a URL such as https://example.com.' },
  { title: 'Validate', text: 'We check the URL, ownership where needed, and block private addresses.' },
  { title: 'Gather', text: 'DNS records, TLS certificate details and HTTP response headers.' },
  { title: 'Check', text: 'Compare what we observe against recognised security guidance.' },
  { title: 'Classify', text: 'Each finding gets a severity, evidence and a confidence level.' },
  { title: 'Report', text: 'Plain-English findings and step-by-step remediation.' },
]

export function HowItWorks() {
  return (
    <section id="how" className="relative z-10 bg-navy px-6 py-20">
      <div className="mx-auto max-w-[1240px]">
        <div className="reveal mx-auto max-w-[720px] text-center">
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle>From domain to fix list in six steps</SectionTitle>
        </div>
        <ol className="mt-14 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          {steps.map((s, i) => (
            <li key={s.title} className={cn('reveal rounded-2xl p-6', card)}>
              <div className="font-display text-[40px] font-bold text-royal [-webkit-text-stroke:1px_#7692FF]">{i + 1}</div>
              <h3 className="mt-3 text-lg text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------- Sample finding ---------- */

export function SampleFinding() {
  return (
    <section className="relative z-10 bg-navy px-6 py-20">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12">
        <div className="reveal reveal-left min-w-0 flex-[1_1_360px]">
          <Eyebrow>Actionable findings</Eyebrow>
          <SectionTitle className="text-[clamp(30px,4vw,44px)]">Every finding explains itself</SectionTitle>
          <p className="mt-4.5 text-[17px] leading-relaxed text-sky">
            What we found, why it matters and what to do next, written for site owners, not just security engineers.
            Severity is contextual: a missing header isn't automatically a crisis.
          </p>
          <Link to="/report" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'mt-7')}>
            See a sample report <ArrowRight size={18} />
          </Link>
        </div>
        <div className="reveal reveal-right min-w-0 flex-[1_1_520px] overflow-hidden rounded-[20px] border border-sky/15 bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky/10 px-6.5 py-5.5">
            <div>
              <div className="font-display text-xl font-semibold text-white">Content Security Policy</div>
              <div className="mt-1 font-mono text-xs text-subtle">HTTP headers · Confidence: high</div>
            </div>
            <div className="flex gap-2">
              <span className="rounded-[7px] bg-high px-2.5 py-1 text-xs font-semibold text-[#2a1405]">High priority</span>
              <span className="rounded-[7px] border border-fail/35 bg-fail/15 px-2.5 py-1 text-xs font-semibold text-fail">Missing</span>
            </div>
          </div>
          <div className="grid gap-5 px-6.5 py-6">
            <Field label="What we found">The website's HTTP response did not include a Content-Security-Policy header.</Field>
            <Field label="Why it matters">
              A well-configured CSP restricts the sources a browser loads resources from, reducing the impact of
              certain injection attacks.
            </Field>
            <Field label="Recommended action">Define and test an appropriate Content Security Policy for the website.</Field>
            <p className="text-xs text-subtle italic">Illustrative finding, not an actual scan result.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.1em] text-periwinkle">{label}</div>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{children}</p>
    </div>
  )
}

/* ---------- Audience ---------- */

export function Audience() {
  const individuals = ['Freelance developers', 'Bloggers', 'Portfolio owners', 'Personal sites', 'Small online stores']
  const businesses = ['SMEs', 'E-commerce', 'Digital agencies', 'Startups', 'IT departments']
  return (
    <section id="who" className="relative z-10 bg-navy px-6 py-20">
      <div className="mx-auto max-w-[1240px]">
        <div className="reveal mx-auto max-w-[720px] text-center">
          <Eyebrow>Who it's for</Eyebrow>
          <SectionTitle>Built for a portfolio or an enterprise</SectionTitle>
        </div>
        <div className="mt-12 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-5">
          <div className="reveal reveal-left lift rounded-[22px] border border-sky/12 bg-surface p-9">
            <h3 className="text-[26px] text-white">Individuals</h3>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Find out if your personal site or portfolio has basic security weaknesses, in minutes.
            </p>
            <div className="mt-5.5 flex flex-wrap gap-2">
              {individuals.map((t) => (
                <span key={t} className="rounded-full bg-periwinkle/15 px-3.5 py-1.5 text-[13px] text-sky">{t}</span>
              ))}
            </div>
          </div>
          <div className="reveal reveal-right lift rounded-[22px] border border-sky/20 bg-[linear-gradient(160deg,#1B2CC1,#12207f)] p-9">
            <h3 className="text-[26px] text-white">Businesses</h3>
            <p className="mt-3 text-base leading-relaxed text-ink">
              Assess before a launch, then monitor whether your security configuration has slipped over time.
            </p>
            <div className="mt-5.5 flex flex-wrap gap-2">
              {businesses.map((t) => (
                <span key={t} className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] text-white">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Responsible by design ---------- */

const safeguards = [
  'Private and internal addresses blocked',
  'Every DNS lookup and redirect validated',
  'HTTP and HTTPS only, no arbitrary ports',
  'Timeouts and response-size limits',
  'Ownership verification for deeper checks',
  'Rate-limited, never executes site content',
]

export function Responsible() {
  return (
    <section className="relative z-10 bg-navy px-6 py-20">
      <div
        className="reveal reveal-zoom mx-auto flex max-w-[1240px] flex-wrap gap-10 rounded-3xl border border-sky/20 bg-cover bg-center bg-no-repeat p-[clamp(28px,5vw,64px)] shadow-[0_30px_70px_rgba(3,8,30,0.45)]"
        style={{
          backgroundImage: `linear-gradient(100deg, rgba(9,21,64,0.95) 0%, rgba(9,21,64,0.84) 50%, rgba(9,21,64,0.72) 100%), url(${responsibleBg})`,
        }}
      >
        <div className="min-w-0 flex-[1_1_320px]">
          <Eyebrow>Responsible by design</Eyebrow>
          <h2 className="mt-3.5 text-[clamp(26px,3.4vw,38px)] leading-[1.15] font-bold text-white">
            A security tool that is secure itself
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Our scanner follows strict safeguards so it can never be turned against you or anyone else.
          </p>
        </div>
        <ul className="grid min-w-0 flex-[1_1_480px] grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-3.5 text-[15px] text-ink">
          {safeguards.map((s) => (
            <li key={s} className="flex gap-2.5">
              <Check size={20} className="mt-px shrink-0 text-periwinkle" />
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Call to action ---------- */

export function CallToAction() {
  return (
    <section className="relative z-10 bg-navy px-6 pt-10 pb-24">
      <div className="reveal reveal-zoom relative mx-auto max-w-[1240px] overflow-hidden rounded-[28px] bg-[radial-gradient(ellipse_at_50%_0%,#2a3cf0,#1B2CC1_45%,#0f1c86)] px-8 py-[clamp(40px,6vw,72px)] text-center">
        <h2 className="mx-auto max-w-[760px] text-[clamp(30px,4.6vw,52px)] leading-[1.08] font-bold text-white">
          Know exactly where your website stands
        </h2>
        <p className="mx-auto mt-4.5 max-w-[560px] text-lg leading-relaxed text-ink">
          Run your first assessment free. No installation, no agents.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/scan" className={buttonVariants({ variant: 'white', size: 'lg', className: 'font-bold' })}>
            Start free scan
          </Link>
          <Link to="/dashboard" className={buttonVariants({ variant: 'outlineWhite', size: 'lg' })}>
            View dashboard
          </Link>
        </div>
      </div>
    </section>
  )
}
