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
  const progressRef = useRef(0)
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (reduced) return
    const gsapCtx = gsap.context(() => {
      // Feed raw scroll progress (0..1) to the 3D scene every frame.
      ScrollTrigger.create({
        trigger: wrapRef.current,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          progressRef.current = self.progress
        },
      })

      // The scroll cue clears out first.
      gsap.to('.cine-scroll-hint', {
        opacity: 0,
        ease: 'none',
        scrollTrigger: { trigger: wrapRef.current, start: '8% top', end: '20% top', scrub: true },
      })

      // Headline drifts up and softens — it hands off before the phone does.
      gsap.to('.cine-text', {
        opacity: 0,
        y: -80,
        filter: 'blur(6px)',
        ease: 'none',
        scrollTrigger: { trigger: wrapRef.current, start: '44% top', end: '68% top', scrub: true },
      })

      // The phone keeps rotating, then docks: scales down, drifts aside and
      // fades — guiding the eye down into the workspace rising underneath.
      gsap.to('.cine-phone', {
        scale: 0.72,
        xPercent: 15,
        yPercent: -5,
        opacity: 0,
        ease: 'none',
        transformOrigin: '72% 46%',
        scrollTrigger: { trigger: wrapRef.current, start: '60% top', end: '88% top', scrub: true },
      })

      // A matching-grey veil fades in over the hero as the workspace overlaps
      // it, so the scene recedes into depth. (A CSS `filter` on the canvas's
      // ancestor breaks WebGL compositing, so we cross-fade a veil instead.)
      gsap.to('.cine-recede', {
        opacity: 0.82,
        ease: 'none',
        scrollTrigger: { trigger: wrapRef.current, start: '62% top', end: '98% top', scrub: true },
      })
    }, wrapRef)

    return () => gsapCtx.revert()
  }, [reduced])

  return (
    <section ref={wrapRef} className="cine" aria-label="Introduction">
      <div className="cine-stage">
        <div className="cine-scrim" aria-hidden="true" />

        <div className="cine-overlay">
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
            <div className="cine-phone">
              <Iphone3D progressRef={progressRef} reduced={reduced} />
            </div>
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

        <div className="cine-recede" aria-hidden="true" />
      </div>
    </section>
  )
}
