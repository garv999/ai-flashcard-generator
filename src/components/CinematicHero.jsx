import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Iphone3D from './Iphone3D.jsx'
import { SparklesIcon, ChevronRightIcon } from './Icons.jsx'

gsap.registerPlugin(ScrollTrigger)

// Landing hero: bold headline + CTA on the left, a real 3D iPhone 16 Pro on the
// right that rotates as the page scrolls. GSAP/ScrollTrigger publishes scroll
// progress (0..1) to the 3D scene and fades the overlay out at the end.
export default function CinematicHero({ onGetStarted }) {
  const wrapRef = useRef(null)
  const overlayRef = useRef(null)
  const progressRef = useRef(0)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) return
    const gsapCtx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          progressRef.current = self.progress
        },
      })

      // Hand the overlay off as the scroll ends (fully legible until then).
      gsap.to(overlayRef.current, {
        opacity: 0,
        y: -60,
        ease: 'none',
        scrollTrigger: {
          trigger: wrapRef.current,
          start: '66% top',
          end: 'bottom bottom',
          scrub: true,
        },
      })
    }, wrapRef)

    return () => gsapCtx.revert()
  }, [reduced])

  return (
    <section ref={wrapRef} className="cine" aria-label="Introduction">
      <div className="cine-stage">
        <div className="cine-scrim" aria-hidden="true" />

        <div className="cine-overlay" ref={overlayRef}>
          <div className="cine-text">
            <p className="cine-eyebrow" data-hero-in>
              AI-Powered Study Workspace
            </p>
            <h1 className="cine-title" data-hero-in>
              Learn anything,
              <br />
              <em>remember</em> everything.
            </h1>
            <p className="cine-sub" data-hero-in>
              Turn any topic or PDF into a smart flashcard deck with spaced repetition built
              in — so knowledge actually sticks.
            </p>
            <button type="button" className="cine-cta" onClick={onGetStarted} data-hero-in>
              <SparklesIcon />
              Start studying
            </button>
          </div>

          <div className="cine-visual" data-hero-in aria-hidden="true">
            <Iphone3D progressRef={progressRef} reduced={reduced} />
          </div>
        </div>

        <button
          type="button"
          className="cine-scroll-hint"
          onClick={onGetStarted}
          aria-label="Scroll to the workspace"
        >
          <span>Scroll to explore</span>
          <ChevronRightIcon />
        </button>
      </div>
    </section>
  )
}
