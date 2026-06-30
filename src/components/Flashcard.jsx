import { useState, useEffect } from 'react'
import { RotateIcon } from './Icons.jsx'

export default function Flashcard({ card, index, total }) {
  const [flipped, setFlipped] = useState(false)

  // Reset to the question side whenever we move to a different card.
  useEffect(() => {
    setFlipped(false)
  }, [card])

  function toggle() {
    setFlipped((f) => !f)
  }

  return (
    <div
      className={`flashcard ${flipped ? 'flipped' : ''}`}
      onClick={toggle}
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `Answer for card ${index + 1} of ${total}. ${card.answer}. Activate to show the question.`
          : `Question ${index + 1} of ${total}. ${card.question}. Activate to reveal the answer.`
      }
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          toggle()
        }
      }}
    >
      <div className="flashcard-inner">
        <div className="flashcard-face flashcard-front" aria-hidden={flipped}>
          <span className="card-tag">
            Question {index + 1} / {total}
          </span>
          <p className="card-text">{card.question}</p>
          <span className="flip-hint">
            <RotateIcon />
            Click to reveal answer
          </span>
        </div>
        <div className="flashcard-face flashcard-back" aria-hidden={!flipped}>
          <span className="card-tag">Answer</span>
          <p className="card-text">{card.answer}</p>
          <span className="flip-hint">
            <RotateIcon />
            Click to flip back
          </span>
        </div>
      </div>
    </div>
  )
}
