import { useState, useEffect, useRef, useCallback } from 'react'
import Flashcard from './Flashcard.jsx'
import { SparklesIcon, RotateIcon, ChevronLeftIcon } from './Icons.jsx'
import {
  RATINGS,
  getDueIndices,
  previewInterval,
  nextDueAt,
  formatDueIn,
} from '../services/srs.js'

// A spaced-repetition review session over a single deck's due cards.
// Flip to reveal the answer, then rate recall (Again / Hard / Good / Easy).
// Each rating reschedules the card via SM-2 and persists through onRate.
export default function ReviewSession({ set, onRate, onExit }) {
  // Freeze "now" and the due queue at session start so ratings don't reshuffle
  // the queue mid-session. `queue` holds card indices into set.cards.
  const startNow = useRef(Date.now())
  const [queue, setQueue] = useState(() => getDueIndices(set, startNow.current))
  const [pos, setPos] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [stats, setStats] = useState({ reviewed: 0, again: 0 })

  const cardIndex = queue[pos]
  const card = cardIndex != null ? set.cards[cardIndex] : null
  const done = pos >= queue.length

  const rate = useCallback(
    (rating) => {
      if (!card) return
      onRate(set.id, cardIndex, rating)
      setStats((s) => ({
        reviewed: s.reviewed + 1,
        again: s.again + (rating === 'again' ? 1 : 0),
      }))
      // A lapsed card comes back later in the same session.
      if (rating === 'again') setQueue((q) => [...q, cardIndex])
      setRevealed(false)
      setPos((p) => p + 1)
    },
    [card, cardIndex, onRate, set.id],
  )

  // Keyboard: 1–4 to rate once the answer is revealed.
  useEffect(() => {
    if (done || !revealed) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const idx = ['1', '2', '3', '4'].indexOf(e.key)
      if (idx >= 0) {
        e.preventDefault()
        rate(RATINGS[idx].key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, revealed, rate])

  // ---- Caught up -------------------------------------------------------
  if (done) {
    const next = nextDueAt(set, Date.now())
    return (
      <div className="review-done">
        <div className="review-done-art" aria-hidden="true">
          <SparklesIcon />
        </div>
        <h3>{stats.reviewed > 0 ? 'Session complete' : 'All caught up'}</h3>
        <p>
          {stats.reviewed > 0
            ? `You reviewed ${stats.reviewed} card${stats.reviewed === 1 ? '' : 's'}` +
              (stats.again ? ` · ${stats.again} to revisit` : '') +
              '.'
            : 'No cards are due for review right now.'}
        </p>
        {next && <p className="review-next">Next review due in {formatDueIn(next)}.</p>}
        <button type="button" className="btn-ghost review-back" onClick={onExit}>
          <ChevronLeftIcon />
          Back to browsing
        </button>
      </div>
    )
  }

  const reviewedCount = stats.reviewed
  const remaining = queue.length - pos
  const total = reviewedCount + remaining
  const progress = total > 0 ? (reviewedCount / total) * 100 : 0

  return (
    <div className="review" aria-label={`Reviewing ${set.topic}`}>
      <div className="review-bar">
        <span className="review-count" aria-live="polite">
          {remaining} left · {reviewedCount} done
        </span>
        <button type="button" className="review-exit" onClick={onExit}>
          End session
        </button>
      </div>

      <div className="review-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="review-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <Flashcard
        key={pos}
        card={card}
        index={pos}
        total={total}
        onFlip={setRevealed}
      />

      {revealed ? (
        <div className="review-actions" role="group" aria-label="Rate your recall">
          {RATINGS.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`rate-btn rate-${r.key}`}
              onClick={() => rate(r.key)}
            >
              <span className="rate-label">{r.label}</span>
              <span className="rate-interval">{previewInterval(card, r.key, Date.now())}</span>
              <span className="rate-key" aria-hidden="true">{r.num}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="review-hint">
          <RotateIcon />
          Recall the answer, then flip the card to rate yourself.
        </p>
      )}
    </div>
  )
}
