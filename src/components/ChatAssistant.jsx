import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  CloseIcon,
  SendIcon,
  MessageIcon,
  SparklesIcon,
  RotateIcon,
  TargetIcon,
  FlameIcon,
  ChartIcon,
  CardsIcon,
  CheckIcon,
  ChevronRightIcon,
} from './Icons.jsx'
import {
  makeMessage,
  loadLocalChat,
  saveLocalChat,
  subscribeToChat,
  appendChatMessages,
} from '../services/chat.js'
import { answerAssistant } from '../services/aiService.js'
import { buildCoachBriefing } from '../services/coach.js'
import MessageContent from './MessageContent.jsx'

// One-tap study prompts covering the assistant's content skills. Each sends a
// ready-made question; users can also type their own (including follow-ups).
const QUICK_ACTIONS = [
  { key: 'explain', label: 'Explain', prompt: 'Explain the most important concept in this deck clearly.' },
  { key: 'simplify', label: 'Simplify', prompt: "Explain this deck in simple terms, like I'm a beginner." },
  { key: 'example', label: 'Example', prompt: 'Give a real-world example for a key concept in this deck.' },
  { key: 'compare', label: 'Compare', prompt: 'Compare two important concepts from this deck.' },
  { key: 'mnemonic', label: 'Mnemonic', prompt: 'Create a mnemonic to help me remember the key facts in this deck.' },
]

// Coach-oriented prompts, answered from the learner's live progress data.
const COACH_PROMPTS = [
  { key: 'next', label: 'What next?', prompt: 'What should I study next?' },
  { key: 'weak', label: 'Weak areas', prompt: 'Where am I weak and what should I focus on?' },
  { key: 'load', label: "Today's plan", prompt: 'How much should I study today?' },
  { key: 'ready', label: 'Am I ready?', prompt: 'Am I on track for my upcoming exam or interview?' },
]

// Recommendation-kind → icon.
const KIND_ICON = {
  exam: TargetIcon,
  review: RotateIcon,
  'weak-quiz': ChartIcon,
  'weak-retention': ChartIcon,
  streak: FlameIcon,
  'new-deck': CardsIcon,
  'caught-up': CheckIcon,
  empty: SparklesIcon,
}

// A slide-in AI Study Coach panel. Beyond answering questions about the deck /
// PDF (with RAG), it analyzes the learner's progress across all decks — spaced
// repetition, quizzes, analytics, mastery and study plans — to recommend what
// to study next, surface weak areas, estimate workload and track exam prep.
// Persists the conversation to localStorage (Demo) or Firestore (signed in).
export default function ChatAssistant({
  deck,
  sets = [],
  stats,
  user,
  settings,
  open,
  onClose,
  onCoachAction,
}) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)
  // Tracks the in-flight answer request so it can be cancelled when the drawer
  // closes or the active deck changes.
  const abortRef = useRef(null)

  const deckId = deck?.id
  const provider = settings?.provider || 'demo'

  // Recompute the coaching briefing from live state whenever the panel opens or
  // progress changes. Drives both the briefing UI and the AI's coaching answers.
  const briefing = useMemo(
    () => buildCoachBriefing({ sets, stats, activeId: deckId, now: Date.now() }),
    [sets, stats, deckId, open],
  )

  // Load / subscribe to this deck's conversation whenever the panel opens or the
  // active deck / auth state changes.
  useEffect(() => {
    if (!open || !deckId) return
    setTyping(false)
    setError('')
    let unsub = () => {}
    if (user) {
      unsub = subscribeToChat(user.uid, deckId, setMessages)
    } else {
      setMessages(loadLocalChat(deckId))
    }
    return () => {
      unsub()
      // Cancel any in-flight answer for the deck / panel we're leaving so its
      // result can't land against a superseded deck.
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open, deckId, user])

  // Persist the conversation for the active mode. Signed in, we append only the
  // newly added messages (each is its own small Firestore doc, so a long chat
  // never approaches the 1 MB per-document limit). In Demo mode we rewrite the
  // full array into localStorage.
  const persist = useCallback(
    (fullMsgs, newMsgs) => {
      if (!deckId) return
      if (user) {
        appendChatMessages(user.uid, deckId, newMsgs).catch((e) =>
          console.error('[Flashcards] Failed to save chat:', e),
        )
      } else {
        saveLocalChat(deckId, fullMsgs)
      }
    },
    [deckId, user],
  )

  // Keep the newest message (or the typing indicator) in view. Scroll the list
  // container itself — never the page behind it.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing, open])

  // Focus the input and wire Escape-to-close while open.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Send a message (or a one-tap quick-action prompt) and fetch the AI reply.
  const send = useCallback(
    async (preset) => {
      const text = (preset ?? input).trim()
      if (!text || typing) return
      const prior = messages
      const userMsg = makeMessage('user', text)
      const base = [...prior, userMsg]
      setMessages(base)
      setInput('')
      setError('')
      persist(base, [userMsg])

      // Supersede any previous in-flight answer, and track this one so closing
      // the drawer or switching decks can cancel it.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const { signal } = controller

      setTyping(true)
      try {
        const reply = await answerAssistant({
          question: text,
          deck,
          history: prior,
          settings,
          user,
          coach: briefing,
          signal,
        })
        if (signal.aborted) return // superseded — drop the result, don't persist
        const assistantMsg = makeMessage('assistant', reply)
        const next = [...base, assistantMsg]
        setMessages(next)
        persist(next, [assistantMsg])
      } catch (e) {
        if (signal.aborted || e?.name === 'AbortError') return // cancelled — stay silent
        setError(e?.message || 'Something went wrong. Please try again.')
      } finally {
        // Only clear the typing indicator if this request is still the current
        // one (a newer send or a deck switch may have taken over).
        if (abortRef.current === controller) {
          abortRef.current = null
          setTyping(false)
        }
      }
    },
    [input, typing, messages, deck, settings, user, briefing, persist],
  )

  // Act on a recommendation card: jump to the recommended deck + study mode and
  // close the panel. Cards without a target (informational) do nothing.
  const act = useCallback(
    (rec) => {
      if (rec?.deckId && rec?.mode && onCoachAction) {
        onCoachAction(rec.deckId, rec.mode)
        onClose()
      }
    },
    [onCoachAction, onClose],
  )

  if (!open) return null

  const kind = deck?.source === 'pdf' ? 'PDF' : 'deck'

  return (
    <div className="chat-overlay" onClick={onClose}>
      <aside
        className="chat-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Study coach for ${deck?.topic || 'this deck'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="chat-head">
          <span className="chat-head-icon" aria-hidden="true">
            <SparklesIcon />
          </span>
          <div className="chat-head-titles">
            <h2>Study coach</h2>
            <p title={deck?.topic}>{deck?.topic}</p>
            {deck?.rag?.count > 0 && (
              <span
                className="chat-rag-badge"
                title={`Full-document context: ${deck.rag.count} passages indexed`}
              >
                <SparklesIcon /> Full-document context
              </span>
            )}
          </div>
          <button
            type="button"
            className="chat-close"
            onClick={onClose}
            aria-label="Close assistant"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="chat-messages" ref={listRef} data-lenis-prevent>
          {messages.length === 0 && !typing && (
            <div className="chat-welcome coach-welcome">
              <div className="coach-hero">
                <span className="coach-hero-icon" aria-hidden="true">
                  <SparklesIcon />
                </span>
                <div className="coach-hero-text">
                  <p className="coach-hero-title">Your study coach</p>
                  <p className="coach-hero-sub">
                    {briefing.hasDecks
                      ? `${briefing.totals.due} due · ~${briefing.workloadMin} min today · ${briefing.streak}-day streak`
                      : 'Create a deck and I’ll build your plan.'}
                  </p>
                </div>
              </div>

              {briefing.recommendations.length > 0 && (
                <div className="coach-recs">
                  {briefing.recommendations.slice(0, 4).map((r) => {
                    const Icon = KIND_ICON[r.kind] || SparklesIcon
                    const actionable = !!(r.deckId && r.mode && onCoachAction)
                    const inner = (
                      <>
                        <span className={`coach-rec-icon kind-${r.kind}`} aria-hidden="true">
                          <Icon />
                        </span>
                        <span className="coach-rec-body">
                          <span className="coach-rec-title">{r.title}</span>
                          <span className="coach-rec-detail">{r.detail}</span>
                        </span>
                        {actionable && (
                          <span className="coach-rec-cta">
                            {r.cta}
                            <ChevronRightIcon />
                          </span>
                        )}
                      </>
                    )
                    return actionable ? (
                      <button key={r.id} type="button" className="coach-rec" onClick={() => act(r)}>
                        {inner}
                      </button>
                    ) : (
                      <div key={r.id} className="coach-rec coach-rec-static">
                        {inner}
                      </div>
                    )
                  })}
                </div>
              )}

              <p className="coach-ask-hint">
                <MessageIcon />
                Ask me anything about your progress or this {kind}
              </p>
              <div className="chat-welcome-actions">
                {COACH_PROMPTS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    className="chat-chip"
                    onClick={() => send(a.prompt)}
                    disabled={typing}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
              <div className="chat-bubble">
                {m.role === 'assistant' ? <MessageContent text={m.text} /> : m.text}
              </div>
            </div>
          ))}

          {typing && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-bubble chat-typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        {messages.length > 0 && (
          <div className="chat-actions" role="group" aria-label="Quick study prompts">
            {QUICK_ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                className="chat-chip"
                onClick={() => send(a.prompt)}
                disabled={typing}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}

        {provider === 'demo' && (
          <p className="chat-notice" role="note">
            Demo mode — answers are generated from this {kind} on your device. Switch to OpenAI or
            Claude in Settings for full AI.
          </p>
        )}

        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <textarea
            ref={inputRef}
            className="chat-textarea"
            rows={1}
            placeholder={`Ask about this ${kind}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            type="submit"
            className="chat-send"
            disabled={!input.trim() || typing}
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </aside>
    </div>
  )
}
