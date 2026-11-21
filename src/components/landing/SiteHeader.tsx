import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const links = [
  { href: '#checks', label: 'What we check' },
  { href: '#how', label: 'How it works' },
  { href: '#who', label: "Who it's for" },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-navy/10 bg-white shadow-[0_6px_24px_rgba(3,8,30,0.18)]">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-6 py-3">
          <Logo tone="dark" />
          <nav aria-label="Main" className="hidden gap-8 text-[15px] md:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="nav-underline font-medium text-navy hover:text-royal">
                {l.label}
              </a>
            ))}
            <Link to="/dashboard" className="nav-underline font-medium text-navy hover:text-royal">
              Dashboard
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className={cn(buttonVariants({ variant: 'light' }), 'hidden md:inline-flex font-medium')}>
              Sign in
            </Link>
            <Link to="/scan" className={cn(buttonVariants(), 'hidden md:inline-flex')}>
              Start free scan
            </Link>
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-navy/20 text-navy md:hidden"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-[55] bg-[rgba(5,10,30,0.6)] transition-opacity duration-400',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <aside
        aria-label="Mobile menu"
        className={cn(
          'fixed inset-y-0 right-0 z-[60] flex w-[min(320px,86vw)] flex-col gap-2 border-l border-sky/15 bg-[#0c1a4d] p-6 transition-transform duration-450 ease-[cubic-bezier(0.2,0.7,0.2,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-lg font-bold text-white">Menu</span>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-sky/20 text-sky"
          >
            <X size={20} />
          </button>
        </div>
        {links.map((l) => (
          <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-[10px] px-3 py-3.5 text-[17px] text-sky hover:bg-sky/10">
            {l.label}
          </a>
        ))}
        <Link to="/dashboard" className="rounded-[10px] px-3 py-3.5 text-[17px] text-sky hover:bg-sky/10">
          Dashboard
        </Link>
        <div className="flex-1" />
        <Link to="/dashboard" className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }), 'w-full font-medium')}>
          Sign in
        </Link>
        <Link to="/scan" className={cn(buttonVariants({ size: 'lg' }), 'w-full')}>
          Start free scan
        </Link>
      </aside>
    </>
  )
}
