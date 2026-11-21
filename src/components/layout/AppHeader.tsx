import type { ReactNode } from 'react'
import { Logo } from '@/components/layout/Logo'

/** Simple top bar used on the Scan and Report screens. */
export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 border-b border-navy/10 bg-white shadow-[0_6px_24px_rgba(3,8,30,0.18)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Logo tone="dark" />
        <div className="flex flex-wrap gap-2.5">{children}</div>
      </div>
    </header>
  )
}
