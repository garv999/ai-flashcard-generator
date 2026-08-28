import { useState, useMemo, useCallback, useEffect } from 'react'
import { buildBlueprint, generateExam, gradeExam } from '../services/exam/index.js'
import {
  SparklesIcon,
  CheckIcon,
  CloseIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateIcon,
  TargetIcon,
  FileTextIcon,
} from './Icons.jsx'

const LETTERS = ['A', 'B', 'C', 'D']
const LENGTHS = [5, 10, 20]

// Circular score dial (mirrors the Quiz ScoreRing; reuses the .quiz-ring styles).
function ScoreRing({ pct }) {
  const R = 52
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg className="quiz-ring" viewBox="0 0 120 120" role="img" aria-label={`Score ${pct}%`}>
      <circle className="quiz-ring-track" cx="60" cy="60" r={R} />
      <circle className="quiz-ring-fill" cx="60" cy="60" r={R} style={{ strokeDasharray: C, strokeDashoffset: offset }} />
      <text className="quiz-ring-text" x="60" y="60" dominantBaseline="central" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  )
}

// Citation line for a document-grounded exam item.
function Citation({ sources }) {
  if (sources?.kind !== 'document') return null
  const s = sources.items?.[0]
  if (!s || s.page == null) return null
  return (
    <span className="exam-cite">
      <FileTextIcon />
      Source · Page {s.page}
      {s.section ? ` · Section ${s.section}` : ''}
    </span>
  )
}

// Adaptive practice exam over one deck. The exam ENGINE (blueprint) selects which
// cards to test from the recommendation ranking (weak areas + ML/SRS forgetting
// risk); the questions reuse the Quiz engine and are grounded via RAG for PDF
// decks. Results break down by predicted risk band. Attempts persist on the deck
// (deck.exam) and never touch SRS or the ML training logs.
export default function ExamSession({ set, stats, settings, user, onSaveResult, onExit }) {
  const [phase, setPhase] = useState('setup') // setup | building | active | results
  const [length, setLength] = useState(10)
  const [focusWeak, setFocusWeak] = useState(true)
  const [exam, setExam] = useState(null) // { blueprint, questions, grounded, source }
  const [error, setError] = useState('')

  const [pos, setPos] = useState(0)
  const [selected, setSelected] = useState(null)
  const [records, setRecords] = useState([])
  const [result, setResult] = useState(null)
  const [bestPct, setBestPct] = useState(() => set.exam?.best?.pct ?? null)
  const [newBest, setNewBest] = useState(false)

  // How many cards could be examined, and the current forgetting-signal source.
  const preview = useMemo(
    () => buildBlueprint({ deck: set, stats, length: 999, focusWeak }),
    [set, stats, focusWeak],
  )

  const startExam = useCallback(
    async (retryIndices = null) => {
      setError('')
      setPhase('building')
      try {
        let blueprint
        if (retryIndices && retryIndices.length) {
          // Retry: keep the failed items, preserving their blueprint metadata.
          const items = retryIndices.map((i) => {
            const prev = exam?.questions.find((q) => q.cardIndex === i)?.examMeta
            return prev ? { ...prev, sources: undefined } : { cardIndex: i, band: 'low', source: exam?.source || 'SRS', riskProb: null }
          })
          blueprint = {
            source: exam?.source || 'SRS',
            focusWeak,
            requested: items.length,
            actual: items.length,
            eligibleCount: preview.eligibleCount,
            canBuild: true,
            items,
          }
        } else {
          blueprint = buildBlueprint({ deck: set, stats, length, focusWeak })
        }
        if (!blueprint.canBuild) {
          setError('This deck needs at least two cards with distinct answers to build an exam.')
          setPhase('setup')
          return
        }
        const gen = await generateExam({ deck: set, blueprint, settings, user })
        if (!gen.questions.length) {
          setError('Could not build exam questions from this deck. Add a few more cards and try again.')
          setPhase('setup')
          return
        }
        setExam({ blueprint, ...gen })
        setPos(0)
        setSelected(null)
        setRecords([])
        setResult(null)
        setNewBest(false)
        setPhase('active')
      } catch (e) {
        setError(e?.message || 'Something went wrong building the exam.')
        setPhase('setup')
      }
    },
    [set, stats, length, focusWeak, settings, user, exam, preview.eligibleCount],
  )

  const questions = exam?.questions || []
  const total = questions.length
  const q = questions[pos]
  const answered = selected !== null

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

  const finish = useCallback(
    (finalRecords) => {
      const graded = gradeExam({ blueprint: exam.blueprint, records: finalRecords })
      const attempt = {
        pct: graded.pct,
        correct: graded.correct,
        total: graded.total,
        at: new Date().toISOString(),
        focusWeak: exam.blueprint.focusWeak,
        length: graded.total,
        source: graded.source,
        weakAccuracy: graded.weakAccuracy,
      }
      setNewBest(bestPct == null || graded.pct > bestPct)
      setBestPct((b) => (b == null ? graded.pct : Math.max(b, graded.pct)))
      onSaveResult?.(set.id, attempt)
      setResult(graded)
      setPhase('results')
    },
    [exam, bestPct, onSaveResult, set.id],
  )

  const advance = useCallback(() => {
    if (pos + 1 >= total) finish(records)
    else {
      setPos((p) => p + 1)
      setSelected(null)
    }
  }, [pos, total, finish, records])

  // Keyboard: 1-4 / A-D to answer, Enter/Space/Right to advance.
  useEffect(() => {
    if (phase !== 'active' || !q) return
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

  // ---- Setup ---------------------------------------------------------------
  if (phase === 'setup') {
    const maxLen = Math.max(1, preview.eligibleCount)
    return (
      <div className="exam-setup">
        <div className="exam-setup-head">
          <span className="exam-setup-icon" aria-hidden="true">
            <TargetIcon />
          </span>
          <div>
            <h3>Adaptive practice exam</h3>
            <p className="exam-setup-sub">
              We pick the questions from your weak spots and forgetting risk
              <span className={`exam-src-tag ${preview.source === 'SRS' ? 'exam-src-srs' : ''}`}>
                {preview.source}
              </span>
            </p>
          </div>
        </div>

        <span className="field-label">Number of questions</span>
        <div className="exam-len" role="radiogroup" aria-label="Number of questions">
          {LENGTHS.filter((n) => n <= maxLen || n === LENGTHS[0]).map((n) => (
            <button
              key={n}
              type="button"
              className={`exam-len-opt ${length === Math.min(n, maxLen) ? 'active' : ''}`}
              onClick={() => setLength(Math.min(n, maxLen))}
            >
              {Math.min(n, maxLen)}
            </button>
          ))}
        </div>

        <label className="exam-toggle">
          <input type="checkbox" checked={focusWeak} onChange={(e) => setFocusWeak(e.target.checked)} />
          <span>
            <strong>Focus on my weak areas</strong>
            <span className="exam-toggle-hint">
              {focusWeak ? 'Weighted toward high-risk, frequently-missed cards.' : 'Balanced coverage across the whole deck.'}
            </span>
          </span>
        </label>

        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}

        <div className="exam-setup-actions">
          <button type="button" className="btn-primary" onClick={() => startExam(null)} disabled={preview.eligibleCount < 2}>
            <SparklesIcon />
            Start exam
          </button>
          <button type="button" className="btn-ghost" onClick={onExit}>
            <ChevronLeftIcon />
            Back
          </button>
        </div>
        {preview.eligibleCount < 2 && (
          <p className="exam-note">Add at least two cards with distinct answers to take an exam.</p>
        )}
      </div>
    )
  }

  // ---- Building ------------------------------------------------------------
  if (phase === 'building') {
    return (
      <div className="quiz-enriching" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h3>Building your exam…</h3>
        <p className="loading-label">Selecting your highest-value questions and grounding them in your material.</p>
      </div>
    )
  }

  // ---- Results -------------------------------------------------------------
  if (phase === 'results' && result) {
    const wrong = records.filter((r) => !r.correct)
    const wrongIndices = result.missedCardIndices
    return (
      <div className="quiz-results" aria-label="Exam results">
        <div className="quiz-results-head">
          {newBest && (
            <span className="quiz-best-badge">
              <SparklesIcon /> New best score!
            </span>
          )}
          <ScoreRing pct={result.pct} />
          <h3>{result.pct >= 80 ? 'Exam passed with flying colors!' : result.pct >= 50 ? 'Solid attempt' : 'Keep practicing'}</h3>
          <p className="quiz-results-sub">
            You got {result.correct} of {result.total} correct.
          </p>
        </div>

        <div className="quiz-stat-grid">
          <div className="quiz-stat">
            <span className="quiz-stat-value">
              {result.correct}
              <span className="quiz-stat-of">/{result.total}</span>
            </span>
            <span className="quiz-stat-label">Score</span>
          </div>
          <div className="quiz-stat">
            <span className="quiz-stat-value">{result.weakAccuracy == null ? 'N/A' : `${result.weakAccuracy}%`}</span>
            <span className="quiz-stat-label">High-risk items</span>
          </div>
          <div className="quiz-stat">
            <span className="quiz-stat-value">{bestPct ?? result.pct}%</span>
            <span className="quiz-stat-label">Best</span>
          </div>
        </div>

        {/* Predicted vs observed: how the exam did across forgetting-risk bands */}
        <div className="exam-bands">
          <h4 className="exam-bands-title">Performance by forgetting risk</h4>
          {['high', 'medium', 'low'].map((band) => {
            const b = result.bands[band]
            if (!b.total) return null
            const pct = Math.round((b.correct / b.total) * 100)
            return (
              <div key={band} className="exam-band-row">
                <span className={`exam-band-tag exam-band-${band}`}>{band} risk</span>
                <span className="exam-band-bar">
                  <span className="exam-band-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="exam-band-num">
                  {b.correct}/{b.total}
                </span>
              </div>
            )
          })}
          <p className="exam-band-note">
            Forgetting risk from {result.source === 'ML' ? 'the personalized model' : 'SRS signals'}. Observed, not a claim about learning.
          </p>
        </div>

        {wrong.length > 0 && (
          <div className="quiz-review">
            <h4 className="quiz-review-title">Review your misses</h4>
            <ul className="quiz-review-list">
              {wrong.map((r, i) => {
                const meta = questions.find((qq) => qq.cardIndex === r.cardIndex)?.examMeta
                return (
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
                    <Citation sources={meta?.sources} />
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="quiz-results-actions">
          {wrongIndices.length > 0 && (
            <button type="button" className="btn-primary quiz-action" onClick={() => startExam(wrongIndices)}>
              <RotateIcon />
              Retry {wrongIndices.length} missed
            </button>
          )}
          <button
            type="button"
            className={`quiz-action ${wrongIndices.length > 0 ? 'btn-ghost' : 'btn-primary'}`}
            onClick={() => setPhase('setup')}
          >
            <SparklesIcon />
            New exam
          </button>
          <button type="button" className="btn-ghost quiz-action" onClick={onExit}>
            <ChevronLeftIcon />
            Back
          </button>
        </div>
      </div>
    )
  }

  // ---- Active exam ---------------------------------------------------------
  if (!q) return null
  const score = records.filter((r) => r.correct).length
  const progress = total > 0 ? (records.length / total) * 100 : 0
  const meta = q.examMeta || {}

  return (
    <div className="quiz exam-active" aria-label={`Exam: ${set.topic}`}>
      <div className="quiz-bar">
        <span className="quiz-count" aria-live="polite">
          Question {pos + 1} of {total}
        </span>
        <div className="quiz-bar-right">
          <span className="quiz-score-pill" aria-live="polite">
            {score} correct
          </span>
          <button type="button" className="review-exit" onClick={onExit}>
            End exam
          </button>
        </div>
      </div>

      <div className="review-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <div className="review-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="quiz-card">
        <span className="card-tag exam-card-tag">
          Question {pos + 1}
          {meta.band && <span className={`exam-band-dot exam-band-${meta.band}`} title={`${meta.band} forgetting risk (${meta.source})`} />}
        </span>
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
            <button key={i} type="button" className={`quiz-option ${state}`} onClick={() => select(i)} disabled={answered} aria-pressed={isPicked}>
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
          <div className={`quiz-feedback-banner ${records[records.length - 1]?.correct ? 'is-correct' : 'is-wrong'}`}>
            <span className="quiz-feedback-icon" aria-hidden="true">
              {records[records.length - 1]?.correct ? <CheckIcon /> : <CloseIcon />}
            </span>
            <span className="quiz-feedback-body">
              <strong>{records[records.length - 1]?.correct ? 'Correct!' : 'Not quite.'}</strong>{' '}
              <span className="quiz-feedback-explain">{q.explanation}</span>
              <Citation sources={meta.sources} />
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
