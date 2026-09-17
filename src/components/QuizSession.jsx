import { useState, useMemo, useEffect, useCallback } from 'react'
import { buildQuiz, canQuiz, needsAiDistractors } from '../services/quiz.js'
import { generateQuizDistractors } from '../services/aiService.js'
import {
  SparklesIcon,
  CheckIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateIcon,
  TargetIcon,
} from './Icons.jsx'

const LETTERS = ['A', 'B', 'C', 'D']

// Circular score dial for the results screen (SVG, no dependencies).
function ScoreRing({ pct }) {
  const R = 52
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg className="quiz-ring" viewBox="0 0 120 120" role="img" aria-label={`Score ${pct}%`}>
      <circle className="quiz-ring-track" cx="60" cy="60" r={R} />
      <circle
        className="quiz-ring-fill"
        cx="60"
        cy="60"
        r={R}
        style={{ strokeDasharray: C, strokeDashoffset: offset }}
      />
      <text className="quiz-ring-text" x="60" y="60" dominantBaseline="central" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  )
}

// A multiple-choice quiz over one deck. Questions are generated from the deck's
// cards (correct answer + up to three distractors from other cards). Best score
// and last attempt persist onto the deck via onSaveResult.
//
// On a SMALL deck the card-based distractor pool can't fill four options, so we
// first ask the AI service for plausible wrong answers written against each
// card. That's best-effort: Demo mode, no key, an error or an unparseable reply
// all fall through to the card-based pool unchanged. The service caches per
// deck, so restarting or retrying a quiz doesn't re-request.
export default function QuizSession({ set, onSaveResult, onExit, settings }) {
  const provider = settings?.provider || 'demo'
  const wantsAi = useMemo(
    () => needsAiDistractors(set) && provider === 'gemini',
    [set, provider],
  )
  const [aiDistractors, setAiDistractors] = useState(null)
  // Only the very first build waits — afterwards the result (or the decision to
  // go without) is in hand, so restart / retry-incorrect rebuild instantly.
  const [enriching, setEnriching] = useState(wantsAi)

  useEffect(() => {
    if (!wantsAi) {
      setAiDistractors(null)
      setEnriching(false)
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setEnriching(true)
    generateQuizDistractors({ deck: set, settings, signal: ac.signal })
      .then((map) => {
        if (!cancelled) setAiDistractors(map)
      })
      .catch(() => {
        // Any failure (including an abort) just means card-based distractors.
      })
      .finally(() => {
        if (!cancelled) setEnriching(false)
      })
    return () => {
      cancelled = true
      ac.abort()
    }
    // A settings change re-runs this, but the service caches per deck+provider,
    // so an unrelated setting edit costs nothing.
  }, [wantsAi, set, provider, settings])

  // attemptCfg drives (re)generation: `indices` narrows to a card subset (retry
  // incorrect); bumping `n` forces a fresh shuffle for a full restart.
  const [attemptCfg, setAttemptCfg] = useState({ indices: null, n: 0 })
  const questions = useMemo(
    () => buildQuiz(set, attemptCfg.indices, aiDistractors),
    [set, attemptCfg, aiDistractors],
  )

  const [pos, setPos] = useState(0)
  const [selected, setSelected] = useState(null) // option index the user picked
  const [records, setRecords] = useState([]) // one per answered question
  const [phase, setPhase] = useState('quiz') // 'quiz' | 'results'
  const [bestPct, setBestPct] = useState(() => set.quiz?.best?.pct ?? null)
  const [newBest, setNewBest] = useState(false)

  const q = questions[pos]
  const answered = selected !== null
  const total = questions.length
  const answeredCount = records.length

  const startAttempt = useCallback((indices) => {
    setAttemptCfg((c) => ({ indices, n: c.n + 1 }))
    setPos(0)
    setSelected(null)
    setRecords([])
    setNewBest(false)
    setPhase('quiz')
  }, [])

  const select = useCallback(
    (optIdx) => {
      if (answered || !q) return
      setSelected(optIdx)
      setRecords((r) => [
        ...r,
        {
          cardIndex: q.cardIndex,
          question: q.question,
          options: q.options,
          correctIndex: q.correctIndex,
          selectedIndex: optIdx,
          correct: optIdx === q.correctIndex,
        },
      ])
    },
    [answered, q],
  )

  const finish = useCallback(() => {
    const correct = records.filter((r) => r.correct).length
    const pct = total ? Math.round((correct / total) * 100) : 0
    const attempt = { pct, correct, total, at: new Date().toISOString() }
    setNewBest(bestPct == null || pct > bestPct)
    setBestPct((b) => (b == null ? pct : Math.max(b, pct)))
    onSaveResult?.(set.id, attempt)
    setPhase('results')
  }, [records, total, bestPct, onSaveResult, set.id])

  const advance = useCallback(() => {
    if (pos + 1 >= total) finish()
    else {
      setPos((p) => p + 1)
      setSelected(null)
    }
  }, [pos, total, finish])

  // Keyboard: 1–4 / A–D to answer, then Enter · Space · → to advance.
  useEffect(() => {
    if (phase !== 'quiz' || !q) return
    function onKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!answered) {
        const k = e.key.toLowerCase()
        let idx = -1
        if (k >= '1' && k <= '9') idx = Number(k) - 1
        else idx = LETTERS.map((l) => l.toLowerCase()).indexOf(k)
        if (idx >= 0 && idx < q.options.length) {
          e.preventDefault()
          select(idx)
        }
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        advance()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, q, answered, select, advance])

  // ---- Not enough material to build a quiz ---------------------------------
  if (!canQuiz(set) || total === 0) {
    return (
      <div className="review-done quiz-empty">
        <div className="review-done-art" aria-hidden="true">
          <TargetIcon />
        </div>
        <h3>Not enough cards to quiz yet</h3>
        <p>Quiz mode needs at least two cards with distinct answers. Add a few more and come back.</p>
        <button type="button" className="btn-ghost review-back" onClick={onExit}>
          <ChevronLeftIcon />
          Back to browsing
        </button>
      </div>
    )
  }

  // ---- Waiting on AI distractors (first build on a small deck only) --------
  if (enriching) {
    return (
      <div className="quiz-enriching" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h3>Writing better answer choices…</h3>
        <p className="loading-label">
          This deck is small, so we&rsquo;re generating plausible alternatives for each question.
        </p>
        <button type="button" className="btn-ghost review-back" onClick={onExit}>
          <ChevronLeftIcon />
          Back to browsing
        </button>
      </div>
    )
  }

  // ---- Results -------------------------------------------------------------
  if (phase === 'results') {
    const correct = records.filter((r) => r.correct).length
    const pct = total ? Math.round((correct / total) * 100) : 0
    const wrong = records.filter((r) => !r.correct)
    const wrongIndices = [...new Set(wrong.map((r) => r.cardIndex))]

    return (
      <div className="quiz-results" aria-label="Quiz results">
        <div className="quiz-results-head">
          {newBest && (
            <span className="quiz-best-badge">
              <SparklesIcon /> New best score!
            </span>
          )}
          <ScoreRing pct={pct} />
          <h3>{pct >= 80 ? 'Great work!' : pct >= 50 ? 'Nice effort' : 'Keep practicing'}</h3>
          <p className="quiz-results-sub">
            You got {correct} of {total} correct.
          </p>
        </div>

        <div className="quiz-stat-grid">
          <div className="quiz-stat">
            <span className="quiz-stat-value">
              {correct}<span className="quiz-stat-of">/{total}</span>
            </span>
            <span className="quiz-stat-label">Score</span>
          </div>
          <div className="quiz-stat">
            <span className="quiz-stat-value">{pct}%</span>
            <span className="quiz-stat-label">Accuracy</span>
          </div>
          <div className="quiz-stat">
            <span className="quiz-stat-value">{bestPct ?? pct}%</span>
            <span className="quiz-stat-label">Best</span>
          </div>
        </div>

        {wrong.length > 0 && (
          <div className="quiz-review">
            <h4 className="quiz-review-title">Review your misses</h4>
            <ul className="quiz-review-list">
              {wrong.map((r, i) => (
                <li key={i} className="quiz-review-item">
                  <p className="quiz-review-q">{r.question}</p>
                  <p className="quiz-review-line quiz-review-wrong">
                    <CloseIcon />
                    <span>
                      <em>Your answer:</em> {r.options[r.selectedIndex]}
                    </span>
                  </p>
                  <p className="quiz-review-line quiz-review-right">
                    <CheckIcon />
                    <span>
                      <em>Correct:</em> {r.options[r.correctIndex]}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="quiz-results-actions">
          {wrongIndices.length > 0 && (
            <button
              type="button"
              className="btn-primary quiz-action"
              onClick={() => startAttempt(wrongIndices)}
            >
              <RotateIcon />
              Retry {wrongIndices.length} incorrect
            </button>
          )}
          <button
            type="button"
            className={`quiz-action ${wrongIndices.length > 0 ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => startAttempt(null)}
          >
            <SparklesIcon />
            Restart full quiz
          </button>
          <button type="button" className="btn-ghost quiz-action" onClick={onExit}>
            <ChevronLeftIcon />
            Back to browsing
          </button>
        </div>
      </div>
    )
  }

  // ---- Active quiz ---------------------------------------------------------
  const score = records.filter((r) => r.correct).length
  const progress = total > 0 ? (answeredCount / total) * 100 : 0

  return (
    <div className="quiz" aria-label={`Quiz: ${set.topic}`}>
      <div className="quiz-bar">
        <span className="quiz-count" aria-live="polite">
          Question {pos + 1} of {total}
        </span>
        <div className="quiz-bar-right">
          <span className="quiz-score-pill" aria-live="polite">
            {score} correct
          </span>
          {bestPct != null && <span className="quiz-best-pill">Best {bestPct}%</span>}
          <button type="button" className="review-exit" onClick={onExit}>
            End quiz
          </button>
        </div>
      </div>

      <div
        className="review-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
      >
        <div className="review-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="quiz-card">
        <span className="card-tag">Question {pos + 1}</span>
        <p className="quiz-question">{q.question}</p>
      </div>

      <div className="quiz-options" role="group" aria-label="Answer choices">
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correctIndex
          const isPicked = i === selected
          let state = ''
          if (answered) {
            if (isCorrect) state = 'correct'
            else if (isPicked) state = 'wrong'
            else state = 'muted'
          }
          return (
            <button
              key={i}
              type="button"
              className={`quiz-option ${state}`}
              onClick={() => select(i)}
              disabled={answered}
              aria-pressed={isPicked}
            >
              <span className="quiz-option-key" aria-hidden="true">
                {LETTERS[i]}
              </span>
              <span className="quiz-option-text">{opt}</span>
              {answered && isCorrect && <CheckIcon className="quiz-option-icon" />}
              {answered && isPicked && !isCorrect && <CloseIcon className="quiz-option-icon" />}
            </button>
          )
        })}
      </div>

      {answered ? (
        <div className="quiz-feedback" aria-live="polite">
          <div
            className={`quiz-feedback-banner ${
              records[records.length - 1]?.correct ? 'is-correct' : 'is-wrong'
            }`}
          >
            <span className="quiz-feedback-icon" aria-hidden="true">
              {records[records.length - 1]?.correct ? <CheckIcon /> : <CloseIcon />}
            </span>
            <span className="quiz-feedback-body">
              <strong>{records[records.length - 1]?.correct ? 'Correct!' : 'Not quite.'}</strong>{' '}
              <span className="quiz-feedback-explain">{q.explanation}</span>
            </span>
          </div>
          <button type="button" className="btn-primary quiz-next" onClick={advance}>
            {pos + 1 >= total ? 'See results' : 'Next question'}
            <ChevronRightIcon />
          </button>
        </div>
      ) : (
        <p className="review-hint quiz-hint">
          <RotateIcon />
          Pick the correct answer — press 1–{q.options.length} or A–{LETTERS[q.options.length - 1]}.
        </p>
      )}
    </div>
  )
}
