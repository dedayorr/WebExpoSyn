import { useEffect } from 'react'

/**
 * Scroll reveal: adds `is-in` to `.reveal` elements while they are on screen,
 * so CSS transitions glide them in, and removes it when they leave, gliding
 * them out. `is-above` records that an element left through the top, so it
 * slides out (and later back in) in the natural direction.
 *
 * Respects "reduce motion" and shows everything if IntersectionObserver is
 * unavailable.
 */
export function useScrollReveal(deps: unknown[] = []) {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    root.classList.add('io-reveal')

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target
          if (entry.isIntersecting) {
            el.classList.add('is-in')
            el.classList.remove('is-above')
          } else {
            el.classList.remove('is-in')
            el.classList.toggle('is-above', entry.boundingClientRect.top < 0)
          }
        }
      },
      // Trigger a little inside the viewport so the movement is visible.
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      root.classList.remove('io-reveal')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
