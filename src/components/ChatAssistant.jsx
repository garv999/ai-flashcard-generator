import { useState, useEffect, useRef, useCallback } from 'react'
import { CloseIcon, SendIcon, MessageIcon, SparklesIcon } from './Icons.jsx'
import {
  makeMessage,
  loadLocalChat,
  saveLocalChat,
  subscribeToChat,
  saveChat,
} from '../services/chat.js'
import { answerAssistant } from '../services/aiService.js'

// One-tap study prompts covering the assistant's core skills. Each sends a
// ready-made question; users can also type their own (including follow-ups).
const QUICK_ACTIONS = [
  { key: 'explain', label: 'Explain', prompt: 'Explain the most important concept in this deck clearly.' },
  { key: 'simplify', label: 'Simplify', prompt: "Explain this deck in simple terms, like I'm a beginner." },
  { key: 'example', label: 'Example', prompt: 'Give a real-world example for a key concept in this deck.' },
  { key: 'compare', label: 'Compare', prompt: 'Compare two important concepts from this deck.' },
  { key: 'mnemonic', label: 'Mnemonic', prompt: 'Create a mnemonic to help me remember the key facts in this deck.' },
]

// A slide-in study-assistant panel scoped to a single deck / PDF. Handles the
// conversation UI, per-deck history, typing indicator, input and auto-scroll,
// persisting to localStorage (Demo) or Firestore (signed in). Answers come from
// the shared AI service using the deck's cards as context.
export default function ChatAssistant({ deck, user, settings, open, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const inputRef = useRef(null)

  const deckId = deck?.id
  const provider = settings?.provider || 'demo'

  // Load / subscribe to this deck's conversation whenever the panel opens or the
  // active deck / auth state changes.
  useEffect(() => {
    if (!open || !deckId) return
    setTyping(false)
    setError('')
    if (user) {
      const unsub = subscribeToChat(user.uid, deckId, setMessages)
      return () => unsub()
    }
    setMessages(loadLocalChat(deckId))
  }, [open, deckId, user])

  // Persist the conversation for the active mode.
  const persist = useCallback(
    (msgs) => {
      if (!deckId) return
      if (user) {
        saveChat(user.uid, deckId, msgs).catch((e) =>
          console.error('[Flashcards] Failed to save chat:', e),
        )
      } else {
        saveLocalChat(deckId, msgs)
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
      const base = [...prior, makeMessage('user', text)]
      setMessages(base)
      setInput('')
      setError('')
      persist(base)
      setTyping(true)
      try {
        const reply = await answerAssistant({ question: text, deck, history: prior, settings })
        const next = [...base, makeMessage('assistant', reply)]
        setMessages(next)
        persist(next)
      } catch (e) {
        setError(e?.message || 'Something went wrong. Please try again.')
      } finally {
        setTyping(false)
      }
    },
    [input, typing, messages, deck, settings, persist],
  )

  if (!open) return null

  const kind = deck?.source === 'pdf' ? 'PDF' : 'deck'

  return (
    <div className="chat-overlay" onClick={onClose}>
      <aside
        className="chat-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Study assistant for ${deck?.topic || 'this deck'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="chat-head">
          <span className="chat-head-icon" aria-hidden="true">
            <SparklesIcon />
          </span>
          <div className="chat-head-titles">
            <h2>Study assistant</h2>
            <p title={deck?.topic}>{deck?.topic}</p>
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
            <div className="chat-welcome">
              <span className="chat-welcome-icon" aria-hidden="true">
                <MessageIcon />
              </span>
              <p className="chat-welcome-title">Ask about “{deck?.topic}”</p>
              <p className="chat-welcome-sub">
                Ask a question, get an explanation, or request a summary of this {kind}. Your
                conversation is saved here.
              </p>
              <div className="chat-welcome-actions">
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
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={`chat-msg chat-msg-${m.role}`}>
              <div className="chat-bubble">{m.text}</div>
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
            Demo mode — answers are generated from this {kind} on your device. Add an API key in
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
