import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import logoIcon from '@/assets/logo-icon.png'
import wordDark from '@/assets/logo-word-dark.png'
import wordWhite from '@/assets/logo-word-white.png'

interface LogoProps {
  /** "dark" = black wordmark for light backgrounds; "light" = white wordmark for dark backgrounds. */
  tone?: 'dark' | 'light'
  /** sm: headers and sidebars. lg: footer and sign-in panel. */
  size?: 'sm' | 'lg'
  to?: string
  className?: string
  iconOnly?: boolean
}

/** The WebExpoSyn lockup: padlock on top, wordmark centred underneath. */
export function Logo({ tone = 'light', size = 'sm', to = '/', className, iconOnly }: LogoProps) {
  return (
    <Link
      to={to}
      aria-label="WebExpoSyn home"
      className={cn('inline-flex w-fit flex-col items-center gap-1', className)}
    >
      <img src={logoIcon} alt="" className={size === 'lg' ? 'h-14 w-auto' : 'h-10 w-auto'} />
      {!iconOnly && (
        <img
          src={tone === 'dark' ? wordDark : wordWhite}
          alt="WebExpoSyn"
          className={size === 'lg' ? 'h-[18px] w-auto' : 'h-[13px] w-auto'}
        />
      )}
    </Link>
  )
}
