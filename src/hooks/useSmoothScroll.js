import { useEffect, useRef, useCallback } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

// Buttery-smooth scrolling via Lenis, wired into GSAP's ticker so ScrollTrigger
// stays perfectly in sync. Disabled under prefers-reduced-motion (native scroll).
// Returns a `scrollTo` helper for CTAs / anchor navigation.
export default function useSmoothScroll() {
  const lenisRef = useRef(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    })
    lenisRef.current = lenis

    lenis.on('scroll', ScrollTrigger.update)
    const raf = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [])

  const scrollTo = useCallback((target, opts = {}) => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(target, { offset: 0, duration: 1.3, ...opts })
    } else {
      const el = typeof target === 'string' ? document.querySelector(target) : target
      el?.scrollIntoView({ behavior: 'auto', block: 'start' })
    }
  }, [])

  return { scrollTo }
}
