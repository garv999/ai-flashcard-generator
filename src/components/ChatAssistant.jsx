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
  FileTextIcon,
} from './Icons.jsx'
import {
  makeMessage,
  loadLocalChat,
  saveLocalChat,
  subscribeToChat,
  appendChatMessages,
} from '../services/chat.js'
import { askTutor } from '../services/tutor/index.js'
import { buildCoachBriefing } from '../services/coach.js'
import MessageContent from './MessageContent.jsx'

// Tutor modes (spec §TUTOR MODES). Each chip forces a real tutor behavior: the
// mode is passed through to askTutor, which adapts the answer to the learner's
// state. If the learner has typed something, the mode is applied to THAT text;
// otherwise a ready-made prompt is used. Typing a free question (no chip) runs
// in AUTO mode, where the tutor classifies the intent itself.
const TUTOR_MODES = [
  { key: 'explain', label: 'Explain', mode: 'EXPLAIN', prompt: 'Explain the key concept I should understand here.' },
  { key: 'practice', label: 'Practice', mode: 'PRACTICE', prompt: 'Give me a practice question based on this material.' },
  { key: 'hint', label: 'Hint', mode: 'HINT', prompt: 'Give me a hint about this — without the answer.' },
  { key: 'review', label: 'Review', mode: 'REVIEW', prompt: 'What should I review here, based on my progress?' },
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
// Citation footer under a grounded assistant answer: an "answer based on your
// material" badge (document-grounded only) plus a collapsible Sources list —
// page/section citations for PDF-backed decks, or referenced flashcards.
function MessageSources({ grounded, sources }) {
  const items = sources?.items || []
  const isDoc = sources?.kind === 'document'
  return (
    <div className="chat-sources">
      {grounded && (
        <span className="chat-grounded" title="This answer was built from the uploaded study material">
          <FileTextIcon />
          Answer based on uploaded material
        </span>
      )}
      {items.length > 0 && (
        <details className="chat-src-details">
          <summary>
            {isDoc ? 'Sources' : 'Referenced flashcards'}
            <span className="chat-src-count">{items.length}</span>
          </summary>
          <ul className="chat-src-list">
            {items.map((s, i) => (
              <li key={i}>
                {isDoc ? (
                  <>
                    <span className="chat-src-ref">
                      {s.page != null ? `Page ${s.page}` : s.label || 'Document'}
                      {s.section ? ` · Section ${s.section}` : ''}
                    </span>
                    {s.snippet && <span className="chat-src-snippet">{s.snippet}…</span>}
                  </>
                ) : (
                  <span className="chat-src-ref">{s.label}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

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
  const [typing, setTyping] = useState(false) // animated dots (until first token)
  const [busy, setBusy] = useState(false) // a request is in flight (blocks re-entry)
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
    setBusy(false)
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

  // Send a message (or a one-tap mode prompt) and fetch the tutor's reply.
  // `mode` is an explicit tutor mode from a mode chip, or 'AUTO' when the
  // learner types a free question (the tutor then classifies the intent).
  const send = useCallback(
    async (preset, mode = 'AUTO') => {
      const text = (preset ?? input).trim()
      if (!text || busy) return
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

      // The assistant reply streams into this placeholder bubble token by token.
      const placeholder = makeMessage('assistant', '')
      const replyId = placeholder.id
      let acc = ''
      let started = false
      const onToken = (delta) => {
        if (signal.aborted) return
        acc += delta
        if (!started) {
          started = true
          setTyping(false) // swap the dots for the live bubble on first token
          setMessages((cur) => [...cur, { ...placeholder, text: acc, streaming: true }])
        } else {
          setMessages((cur) => cur.map((m) => (m.id === replyId ? { ...m, text: acc } : m)))
        }
      }

      setBusy(true)
      setTyping(true)
      try {
        const reply = await askTutor({
          question: text,
          mode,
          deck,
          sets,
          stats,
          history: prior,
          settings,
          user,
          signal,
          onToken,
        })
        if (signal.aborted) return // superseded — drop the result, don't persist
        // askTutor returns { text, sources, grounded, ... }; tolerate a bare
        // string too so nothing breaks if that contract ever changes.
        const replyText = typeof reply === 'string' ? reply : reply?.text || ''
        const finalMsg = {
          ...placeholder,
          text: replyText,
          streaming: false,
          sources: reply?.sources || null,
          grounded: !!reply?.grounded,
        }
        setMessages((cur) =>
          cur.some((m) => m.id === replyId)
            ? cur.map((m) => (m.id === replyId ? finalMsg : m))
            : [...cur, finalMsg],
        )
        persist([...base, finalMsg], [finalMsg])
      } catch (e) {
        // Drop the partial bubble; on a genuine error surface it, on a cancel
        // stay silent.
        setMessages((cur) => cur.filter((m) => m.id !== replyId))
        if (signal.aborted || e?.name === 'AbortError') return
        setError(e?.message || 'Something went wrong. Please try again.')
      } finally {
        // Only clear busy/typing if this request is still the current one (a
        // newer send or a deck switch may have taken over).
        if (abortRef.current === controller) {
          abortRef.current = null
          setBusy(false)
          setTyping(false)
        }
      }
    },
    [input, busy, messages, deck, sets, stats, settings, user, persist],
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
                    disabled={busy}
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
                {m.role !== 'assistant' ? (
                  m.text
                ) : m.streaming ? (
                  // While streaming, render raw partial text (a half-formed
                  // ```mermaid block or table would fail to parse); the finished
                  // message re-renders through MessageContent below.
                  <>
                    {m.text}
                    <span className="chat-caret" aria-hidden="true" />
                  </>
                ) : (
                  <MessageContent text={m.text} />
                )}
              </div>
              {m.role === 'assistant' && !m.streaming && (m.grounded || m.sources) && (
                <MessageSources grounded={m.grounded} sources={m.sources} />
              )}
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
          <div className="chat-actions" role="group" aria-label="Tutor modes">
            {TUTOR_MODES.map((a) => (
              <button
                key={a.key}
                type="button"
                className="chat-chip"
                onClick={() => send(input.trim() ? input : a.prompt, a.mode)}
                disabled={busy}
                title={`${a.label} — ${a.mode.toLowerCase()} mode`}
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
            Demo mode — answers are generated from this {kind} on your device. Switch to Gemini in
            Settings for full AI.
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
            disabled={!input.trim() || busy}
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </aside>
    </div>
  )
}
