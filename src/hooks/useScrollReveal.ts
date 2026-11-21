import { useEffect } from 'react'

/**
 * Scroll reveal fallback.
 *
 * Browsers that support CSS scroll-driven animations (`animation-timeline: view()`)
 * animate `.reveal` elements purely in CSS (see index.css). For browsers that don't
 * (e.g. Firefox today), this hook toggles an `is-in` class with IntersectionObserver
 * so items still slide in when they enter the viewport and out when they leave.
 */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    const supported =
      typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: view()')
    if (supported || !('IntersectionObserver' in window)) return

    const root = document.documentElement
    root.classList.add('io-reveal')

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => entry.target.classList.toggle('is-in', entry.isIntersecting))
      },
      { threshold: 0.12, rootMargin: '-40px 0px -40px 0px' },
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      root.classList.remove('io-reveal')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
