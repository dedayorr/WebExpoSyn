import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import wordWhite from '@/assets/logo-word-white.png'

/** Arrows flying in at different heights; each bounces off the shield. */
const THREATS = [
  { y: 82, delay: '0s', bounce: 'up' },
  { y: 108, delay: '0.5s', bounce: 'down' },
  { y: 128, delay: '1s', bounce: 'up' },
] as const

/** Where each arrow hits the shield's right edge. */
const HIT_X = 156

/**
 * Full-screen loading screen: a guardian crouched behind a shield while
 * attacks bounce off it. Used on the first visit and on the way into the dashboard.
 */
export function ShieldLoader({ label, leaving = false }: { label: string; leaving?: boolean }) {
  // Stop the page behind it from scrolling while it's showing.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        'shield-loader fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_40%,#12226b_0%,#091540_55%,#060f30_100%)] px-6 transition-opacity duration-500',
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
    >
      <svg viewBox="0 0 240 190" className="w-[min(300px,72vw)] overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="sl-shield" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a3cf0" />
            <stop offset="100%" stopColor="#12207f" />
          </linearGradient>
          <radialGradient id="sl-glow">
            <stop offset="0%" stopColor="#7692FF" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#7692FF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Soft glow behind the shield */}
        <circle className="sl-glow" cx="118" cy="104" r="78" fill="url(#sl-glow)" />

        {/* The guardian, crouched behind the shield */}
        <g className="sl-guardian" fill="#ABD2FA">
          <circle cx="74" cy="58" r="11" />
          {/* Leaning torso */}
          <path d="M60 142 C54 120 56 98 64 86 C70 78 80 76 90 80 L102 86 L100 146 C88 150 72 150 60 142 Z" opacity="0.92" />
          {/* Back leg braced against the impact, front leg planted */}
          <path d="M66 140 L48 166" stroke="#ABD2FA" strokeWidth="11" strokeLinecap="round" fill="none" opacity="0.92" />
          <path d="M88 144 L94 168" stroke="#ABD2FA" strokeWidth="11" strokeLinecap="round" fill="none" opacity="0.92" />
          {/* Arm bracing the shield */}
          <path d="M78 94 C86 98 94 102 104 104" stroke="#ABD2FA" strokeWidth="9" strokeLinecap="round" fill="none" />
        </g>

        {/* Shield */}
        <g className="sl-shield">
          <path
            d="M120 46 L158 60 V98 C158 126 142 146 120 158 C98 146 82 126 82 98 V60 Z"
            fill="url(#sl-shield)"
            stroke="#ABD2FA"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            className="sl-shield-edge"
            d="M120 46 L158 60 V98 C158 126 142 146 120 158 C98 146 82 126 82 98 V60 Z"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
            pathLength={100}
          />
          {/* Padlock emblem */}
          <rect x="108" y="96" width="24" height="20" rx="4" fill="#ABD2FA" />
          <path d="M113 96 V89 a7 7 0 0 1 14 0 V96" fill="none" stroke="#ABD2FA" strokeWidth="4" />
          <circle cx="120" cy="105" r="2.6" fill="#12207f" />
          <rect x="119" y="105" width="2" height="6" rx="1" fill="#12207f" />
        </g>

        {/* Incoming attacks, deflected */}
        {THREATS.map((t) => (
          <g key={t.y} transform={`translate(${HIT_X} ${t.y})`}>
            <circle className="sl-impact" r="7" fill="none" stroke="#ABD2FA" strokeWidth="2" style={{ animationDelay: t.delay }} />
            <g className={cn('sl-threat', t.bounce === 'up' ? 'sl-bounce-up' : 'sl-bounce-down')} style={{ animationDelay: t.delay }}>
              <path d="M2 0 H30 M2 0 L10 -5 M2 0 L10 5" stroke="#ff8f80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </g>
          </g>
        ))}
      </svg>

      <img src={wordWhite} alt="WebExpoSyn" className="mt-6 h-[18px] w-auto" />
      <p className="mt-3 text-[15px] text-muted">{label}</p>
      <div className="mt-5 h-1 w-44 overflow-hidden rounded-full bg-sky/10">
        <div className="sl-progress h-full rounded-full bg-[linear-gradient(90deg,#1B2CC1,#7692FF,#ABD2FA)]" />
      </div>
    </div>
  )
}
