import { useState, useEffect } from 'react'
import Flashcard from './Flashcard.jsx'

export default function StudyView({ set }) {
  const [index, setIndex] = useState(0)

  // Reset to the first card when switching sets.
  useEffect(() => {
    setIndex(0)
  }, [set?.id])

  if (!set) {
    return (
      <div className="study-empty">
        <div className="study-empty-art">🧠</div>
        <h2>Generate or select a set to start studying</h2>
        <p>
          Enter a topic above and we'll create a deck of flashcards. Your sets are
          saved in this browser so you can come back anytime.
        </p>
      </div>
    )
  }

  const total = set.cards.length
  const card = set.cards[index]

  const prev = () => setIndex((i) => (i - 1 + total) % total)
  const next = () => setIndex((i) => (i + 1) % total)

  return (
    <div className="study-view">
      <div className="study-header">
        <h2>{set.topic}</h2>
        <span className="progress-pill">
          Card {index + 1} of {total}
        </span>
      </div>

      <Flashcard card={card} index={index} total={total} />

      <div className="study-controls">
        <button onClick={prev} disabled={total <= 1}>
          ← Previous
        </button>
        <div className="dots">
          {set.cards.map((_, i) => (
            <span
              key={i}
              className={`dot ${i === index ? 'active' : ''}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
        <button onClick={next} disabled={total <= 1}>
          Next →
        </button>
      </div>
    </div>
  )
}
