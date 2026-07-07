import { useEffect } from 'react'

// Reveal-on-scroll for any element tagged with a `data-reveal` direction
// ("up" | "down" | "left" | "right"). Elements start offset + transparent and
// animate into place the first time they enter the viewport.
//
// The hidden state only applies once <html> gets `reveal-ready` (added here),
// so content stays fully visible without JS and under reduced motion.
const SELECTOR = '[data-reveal]'

export default function useScrollReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!('IntersectionObserver' in window)) return

    const root = document.documentElement
    root.classList.add('reveal-ready')

    const seen = new WeakSet() // per-run guard, survives StrictMode remounts
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view')
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )

    const observe = (el) => {
      if (seen.has(el)) return
      seen.add(el)
      io.observe(el)
    }
    document.querySelectorAll(SELECTOR).forEach(observe)

    // Pick up elements added later (deck list, study view, banners…).
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue
          if (node.matches?.(SELECTOR)) observe(node)
          node.querySelectorAll?.(SELECTOR).forEach(observe)
        }
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
      // Never leave anything stuck hidden if the app unmounts.
      document
        .querySelectorAll(`${SELECTOR}:not(.in-view)`)
        .forEach((el) => el.classList.add('in-view'))
      root.classList.remove('reveal-ready')
    }
  }, [])
}
