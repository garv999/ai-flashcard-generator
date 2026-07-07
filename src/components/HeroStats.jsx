import { useState, useRef, useEffect } from 'react'

// Animate a number from its previous value up to `target` with an ease-out curve.
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return
    let raf
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

function Stat({ value, label }) {
  const animated = useCountUp(value)
  return (
    <div className="stat">
      <span className="stat-num">{animated.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

// Editorial hero band: a cinematic headline plus live counters describing the
// user's library. All figures are derived from the existing decks — no new data.
export default function HeroStats({ sets }) {
  const decks = sets.length
  const cards = sets.reduce((sum, s) => sum + (s.cards?.length || 0), 0)
  const fromPdf = sets.filter((s) => s.source === 'pdf').length

  return (
    <section className="hero" aria-label="Your library at a glance">
      <div className="hero-copy" data-reveal="left">
        <span className="hero-eyebrow">AI Study Workspace</span>
        <h1 className="hero-title">
          Turn anything into <em>knowledge.</em>
        </h1>
        <p className="hero-sub">
          Generate a deck from any topic or PDF, then study with cards that flip.
        </p>
      </div>

      <div className="hero-stats" role="group" aria-label="Library statistics" data-reveal="right">
        <Stat value={decks} label="Decks" />
        <Stat value={cards} label="Flashcards" />
        <Stat value={fromPdf} label="From PDFs" />
      </div>
    </section>
  )
}
