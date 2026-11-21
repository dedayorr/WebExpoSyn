import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import logoIcon from '@/assets/logo-icon.png'
import wordDark from '@/assets/logo-word-dark.png'
import wordWhite from '@/assets/logo-word-white.png'

interface LogoProps {
  /** "dark" = black wordmark for light backgrounds; "light" = white wordmark for dark backgrounds. */
  tone?: 'dark' | 'light'
  to?: string
  className?: string
  iconOnly?: boolean
}

export function Logo({ tone = 'light', to = '/', className, iconOnly }: LogoProps) {
  return (
    <Link to={to} aria-label="WebExpoSyn home" className={cn('flex items-center gap-2.5', className)}>
      <img src={logoIcon} alt="" className="h-10 w-auto" />
      {!iconOnly && (
        <img src={tone === 'dark' ? wordDark : wordWhite} alt="WebExpoSyn" className="h-5 w-auto" />
      )}
    </Link>
  )
}
