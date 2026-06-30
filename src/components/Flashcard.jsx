import { useState, useEffect } from 'react'

export default function Flashcard({ card, index, total }) {
  const [flipped, setFlipped] = useState(false)

  // Reset to the question side whenever we move to a different card.
  useEffect(() => {
    setFlipped(false)
  }, [card])

  return (
    <div
      className={`flashcard ${flipped ? 'flipped' : ''}`}
      onClick={() => setFlipped((f) => !f)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setFlipped((f) => !f)
        }
      }}
    >
      <div className="flashcard-inner">
        <div className="flashcard-face flashcard-front">
          <span className="card-tag">Question {index + 1} / {total}</span>
          <p className="card-text">{card.question}</p>
          <span className="flip-hint">Click to reveal answer</span>
        </div>
        <div className="flashcard-face flashcard-back">
          <span className="card-tag">Answer</span>
          <p className="card-text">{card.answer}</p>
          <span className="flip-hint">Click to flip back</span>
        </div>
      </div>
    </div>
  )
}
