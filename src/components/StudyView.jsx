import { useState, useEffect, useCallback } from 'react'
import Flashcard from './Flashcard.jsx'
import { ChevronLeftIcon, ChevronRightIcon, CardsIcon } from './Icons.jsx'

export default function StudyView({ set }) {
  const [index, setIndex] = useState(0)

  // Reset to the first card when switching sets.
  useEffect(() => {
    setIndex(0)
  }, [set?.id])

  const total = set?.cards.length ?? 0

  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total])
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total])

  // Arrow-key navigation between cards (ignored while typing in a field).
  useEffect(() => {
    if (!set || total <= 1) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [set, total, prev, next])

  if (!set) {
    return (
      <div className="study-empty">
        <div className="study-empty-art" aria-hidden="true">
          <CardsIcon />
        </div>
        <h2>Generate or select a set to start studying</h2>
        <p>
          Enter a topic above and we'll create a deck of flashcards. Your sets are saved in
          this browser, so you can come back anytime.
        </p>
      </div>
    )
  }

  const card = set.cards[index]
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0

  return (
    <section className="study-view" aria-label={`Studying: ${set.topic}`}>
      <div className="study-header">
        <h2 title={set.topic}>{set.topic}</h2>
        <span className="progress-pill">
          Card {index + 1} of {total}
        </span>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-label="Deck progress"
      >
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <Flashcard card={card} index={index} total={total} />

      <div className="study-controls">
        <button type="button" className="btn-nav" onClick={prev} disabled={total <= 1}>
          <ChevronLeftIcon />
          <span>Previous</span>
        </button>

        <div className="dots" role="group" aria-label="Jump to card">
          {set.cards.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`dot ${i === index ? 'active' : ''}`}
              aria-label={`Go to card ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>

        <button type="button" className="btn-nav" onClick={next} disabled={total <= 1}>
          <span>Next</span>
          <ChevronRightIcon />
        </button>
      </div>
    </section>
  )
}
