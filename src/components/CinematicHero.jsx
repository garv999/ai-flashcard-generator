import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Iphone3D from './Iphone3D.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import {
  SparklesIcon,
  PlayIcon,
  RobotIcon,
  UserSolidIcon,
  TargetIcon,
  ClockIcon,
  LogoMark,
} from './Icons.jsx'

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

        {/* Landing nav, composed like the reference: glass logo pill on the left,
            marketing links in the centre, primary action on the right. The
            centre links have no dedicated pages, so they scroll into the
            workspace rather than 404. */}
        <header className="cine-nav">
          <span className="cine-nav-brand">
            <span className="cine-nav-mark">
              <LogoMark />
            </span>
            <span className="cine-nav-name">
              AI Flashcard
              <br />
              Generator
            </span>
          </span>
          <nav className="cine-nav-links" aria-label="Primary">
            <button type="button" onClick={onGetStarted}>
              Features
            </button>
            <button type="button" onClick={onGetStarted}>
              How it Works
            </button>
            <button type="button" onClick={onGetStarted}>
              Pricing
            </button>
            <button type="button" onClick={onGetStarted}>
              Blog
            </button>
            <button type="button" onClick={onGetStarted}>
              About
            </button>
          </nav>
          <button type="button" className="cine-nav-cta" onClick={onGetStarted}>
            Get Started
          </button>
        </header>

        <div className="cine-overlay">
          <div className="cine-text">
            <p className="cine-eyebrow" data-hero-in>
              AI-Powered Study Workspace
            </p>
            <h1 className="cine-title" data-hero-in>
              Learn <em>anything,</em>
              <br />
              remember
              <br />
              <em>everything.</em>
            </h1>
            <p className="cine-sub" data-hero-in>
              Turn any topic or PDF into smart flashcards with AI explanations, quizzes, and
              spaced repetition.
            </p>
            <div className="cine-actions" data-hero-in>
              <button type="button" className="cine-cta" onClick={onGetStarted}>
                <SparklesIcon />
                Create Your Deck
              </button>
              <button type="button" className="cine-cta-ghost" onClick={onGetStarted}>
                <PlayIcon />
                Explore Features
              </button>
            </div>

            {/* Social proof row, composed as in the reference. The avatars are
                CSS-only and the figures are PLACEHOLDERS — replace them with real
                numbers (or remove the row) before any public launch. */}
            <div className="cine-proof" data-hero-in>
              <span className="cine-proof-avatars" aria-hidden="true">
                <i>
                  <UserSolidIcon />
                </i>
                <i>
                  <UserSolidIcon />
                </i>
                <i>
                  <UserSolidIcon />
                </i>
                <i>
                  <UserSolidIcon />
                </i>
              </span>
              <span className="cine-proof-copy">
                <strong>Loved by 50K+ learners</strong>
                <span className="cine-proof-stars" aria-hidden="true">
                  ★★★★★ <em>4.9/5</em>
                </span>
              </span>
            </div>
          </div>

          <div className="cine-visual" data-hero-in aria-hidden="true">
            <div className="cine-phone">
              {/* If WebGL can't initialise (blocked/unsupported GPU) the 3D scene
                  throws. Scope it so only the phone drops out — the headline, CTA
                  and the rest of the app keep working. */}
              <ErrorBoundary fallback={null}>
                <Iphone3D progressRef={progressRef} reduced={reduced} />
              </ErrorBoundary>
            </div>

            {/* Floating glass stat cards, composed as in the design reference.
                Decorative only (the whole hero is aria-hidden / pointer-events
                none). Values are PLACEHOLDERS — swap the three spans below for
                live data when it is available; no logic depends on them. */}
            <div className="cine-cards">
              <div className="cine-card cine-card-coach">
                <span className="cine-card-avatar">
                  <RobotIcon />
                </span>
                <span className="cine-card-copy">
                  <strong>AI Coach</strong>
                  <em>Always here to help you learn better.</em>
                </span>
              </div>

              <div className="cine-card cine-card-goal">
                <span className="cine-card-head">
                  <TargetIcon />
                  <strong>Today&rsquo;s Goal</strong>
                </span>
                <span className="cine-card-value">24 / 50 cards</span>
                <span className="cine-card-track">
                  <span className="cine-card-fill" style={{ width: '48%' }} />
                </span>
                <span className="cine-card-meta">48%</span>
              </div>

              <div className="cine-card cine-card-time">
                <span className="cine-card-head">
                  <ClockIcon />
                  <strong>Study Time</strong>
                </span>
                <span className="cine-card-value">2h 34m</span>
                <span className="cine-card-meta cine-card-up">+16% vs yesterday</span>
                <svg className="cine-card-spark" viewBox="0 0 96 26" preserveAspectRatio="none">
                  <path
                    d="M1 19 L13 14 L25 17 L37 8 L49 12 L61 5 L73 9 L95 3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="cine-scroll-hint"
          onClick={onGetStarted}
          aria-label="Scroll to the workspace"
        >
          <span className="cine-scroll-mouse" aria-hidden="true">
            <span className="cine-scroll-wheel" />
          </span>
          <span>Scroll to explore</span>
        </button>

        <div className="cine-recede" aria-hidden="true" />
      </div>
    </section>
  )
}
