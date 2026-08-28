import { useState, useEffect, useCallback, useRef } from 'react'
import Flashcard from './Flashcard.jsx'
import ReviewSession from './ReviewSession.jsx'
import QuizSession from './QuizSession.jsx'
import ExamSession from './ExamSession.jsx'
import StudyPlanPanel from './StudyPlanPanel.jsx'
import ChatAssistant from './ChatAssistant.jsx'
import { ChevronLeftIcon, ChevronRightIcon, CardsIcon, MessageIcon } from './Icons.jsx'
import { deckDueCount } from '../services/srs.js'

export default function StudyView({
  set,
  sets,
  stats,
  onRate,
  onSaveQuizResult,
  onSaveExamResult,
  onSavePlan,
  onCoachAction,
  coachNav,
  user,
  settings,
}) {
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState('browse') // 'browse' | 'review' | 'quiz' | 'exam' | 'plan'
  const [chatOpen, setChatOpen] = useState(false)
  const lastNav = useRef(0)

  // Reset to the first card, back to browsing, and close the assistant when
  // switching sets.
  useEffect(() => {
    setIndex(0)
    setMode('browse')
    setChatOpen(false)
  }, [set?.id])

  // Coach navigation: when a recommendation targets THIS deck, switch to the
  // recommended study mode. Runs after the reset effect above, so on a cross-
  // deck jump the requested mode wins. The nonce guard applies each request once.
  useEffect(() => {
    if (coachNav && coachNav.n !== lastNav.current && coachNav.deckId === set?.id && coachNav.mode) {
      lastNav.current = coachNav.n
      setMode(coachNav.mode)
    }
  }, [coachNav, set?.id])

  const total = set?.cards.length ?? 0

  const prev = useCallback(() => setIndex((i) => (i - 1 + total) % total), [total])
  const next = useCallback(() => setIndex((i) => (i + 1) % total), [total])

  // Arrow-key navigation between cards — browse mode only (review has its own keys).
  useEffect(() => {
    if (!set || mode !== 'browse' || total <= 1) return
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
  }, [set, mode, total, prev, next])

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

  const due = deckDueCount(set, Date.now())
  const card = set.cards[index]
  const progress = total > 0 ? ((index + 1) / total) * 100 : 0

  return (
    <section className="study-view" aria-label={`Studying: ${set.topic}`}>
      <div className="study-header">
        <h2 title={set.topic}>{set.topic}</h2>

        <div className="study-header-right">
        <div className="study-modes" role="tablist" aria-label="Study mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'browse'}
            className={`study-mode ${mode === 'browse' ? 'active' : ''}`}
            onClick={() => setMode('browse')}
          >
            Browse
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'review'}
            className={`study-mode ${mode === 'review' ? 'active' : ''}`}
            onClick={() => setMode('review')}
          >
            Review
            {due > 0 && <span className="due-pill">{due}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'quiz'}
            className={`study-mode ${mode === 'quiz' ? 'active' : ''}`}
            onClick={() => setMode('quiz')}
          >
            Quiz
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'exam'}
            className={`study-mode ${mode === 'exam' ? 'active' : ''}`}
            onClick={() => setMode('exam')}
          >
            Exam
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'plan'}
            className={`study-mode ${mode === 'plan' ? 'active' : ''}`}
            onClick={() => setMode('plan')}
          >
            Plan
          </button>
        </div>

          <button
            type="button"
            className="assistant-btn"
            onClick={() => setChatOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={chatOpen}
          >
            <MessageIcon />
            <span>Coach</span>
          </button>
        </div>
      </div>

      {mode === 'review' ? (
        <ReviewSession set={set} onRate={onRate} onExit={() => setMode('browse')} />
      ) : mode === 'quiz' ? (
        <QuizSession
          key={set.id}
          set={set}
          settings={settings}
          onSaveResult={onSaveQuizResult}
          onExit={() => setMode('browse')}
        />
      ) : mode === 'exam' ? (
        <ExamSession
          key={set.id}
          set={set}
          stats={stats}
          settings={settings}
          user={user}
          onSaveResult={onSaveExamResult}
          onExit={() => setMode('browse')}
        />
      ) : mode === 'plan' ? (
        <StudyPlanPanel
          key={set.id}
          deck={set}
          onSave={(config) => onSavePlan(set.id, config)}
          onReset={() => onSavePlan(set.id, null)}
          onStudy={() => setMode('review')}
        />
      ) : (
        <>
          <div className="browse-meta">
            <span className="progress-pill">
              Card {index + 1} of {total}
            </span>
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
        </>
      )}

      <ChatAssistant
        deck={set}
        sets={sets}
        stats={stats}
        user={user}
        settings={settings}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onCoachAction={onCoachAction}
      />
    </section>
  )
}
