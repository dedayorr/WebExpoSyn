import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, ShieldAlert } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { useAuth } from '@/auth/AuthProvider'
import heroBg from '@/assets/hero-bg.jpg'

const points = [
  'Checks SSL/TLS, headers, DNS, email and exposure',
  'No vanity scores: see exactly what passed and failed',
  'Plain-English fixes for every finding',
]

interface AuthLayoutProps {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

/** Split-screen layout shared by the sign-in, sign-up and password pages. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const { configured } = useAuth()

  return (
    <div className="flex min-h-screen bg-navy text-sky">
      {/* Brand panel (hidden on small screens) */}
      <aside
        className="relative hidden w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-cover bg-center p-12 lg:flex"
        style={{ backgroundImage: `url(${heroBg})` }}
      >
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(160deg,rgba(9,21,64,0.94),rgba(9,21,64,0.78)_60%,rgba(27,44,193,0.55))]" />
        <div className="relative">
          <Logo tone="light" />
        </div>
        <div className="relative">
          <h2 className="animate-slide-up stagger-1 text-[40px] leading-[1.08] font-bold text-white">
            Know exactly where your website <span className="text-periwinkle">stands.</span>
          </h2>
          <ul className="mt-8 flex flex-col gap-3.5">
            {points.map((p, i) => (
              <li key={p} className={`animate-slide-up stagger-${i + 2} flex items-start gap-3 text-[15px] text-ink`}>
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal">
                  <Check size={12} strokeWidth={3} className="text-white" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-subtle">© {new Date().getFullYear()} WebExpoSyn</p>
      </aside>

      {/* Form panel */}
      <main className="flex min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_70%_50%_at_70%_0%,rgba(27,44,193,0.25),transparent_70%)]">
        <div className="flex items-center justify-between px-6 py-5 lg:hidden">
          <Logo tone="light" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pt-4 pb-12">
          <div className="animate-slide-left w-full max-w-[420px]">
            <h1 className="text-[clamp(28px,4vw,36px)] font-bold text-white">{title}</h1>
            {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-muted">{subtitle}</p>}

            {!configured && (
              <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-ink">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                <span>
                  Authentication isn't configured yet. Add <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
                  <code className="font-mono text-xs">VITE_SUPABASE_ANON_KEY</code> to <code className="font-mono text-xs">.env</code>.
                </span>
              </div>
            )}

            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
            <p className="mt-10 text-center text-xs text-subtle">
              <Link to="/" className="hover:text-white">
                ← Back to home
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
