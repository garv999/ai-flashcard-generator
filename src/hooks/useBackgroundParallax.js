import { useEffect } from 'react'

// Publishes the scroll position as a CSS variable (--sy) on <html> so the
// fixed background scene can parallax/reveal as the page scrolls. rAF-throttled
// and passive; disabled under prefers-reduced-motion.
export default function useBackgroundParallax() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    let ticking = false

    const update = () => {
      ticking = false
      root.style.setProperty('--sy', window.scrollY + 'px')
      const doc = document.documentElement
      const max = doc.scrollHeight - doc.clientHeight
      root.style.setProperty('--sp', max > 0 ? (window.scrollY / max).toFixed(4) : '0')
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(update)
      }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      root.style.removeProperty('--sy')
      root.style.removeProperty('--sp')
    }
  }, [])
}
