import { useState, useEffect, useRef } from 'react'
import { CloseIcon } from './Icons.jsx'
import { fetchProviderStatus } from '../services/aiProxy.js'

const PROVIDERS = [
  { id: 'demo', name: 'Demo', sub: 'No key needed' },
  { id: 'openai', name: 'OpenAI', sub: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Claude', sub: 'claude-sonnet-5' },
]

export default function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings)
  // Which live providers the server has a key configured for. null = probing.
  const [status, setStatus] = useState(null)
  const closeRef = useRef(null)

  // Move focus into the dialog on open and close on Escape.
  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Ask the proxy which providers are configured (never returns a key itself).
  useEffect(() => {
    let alive = true
    fetchProviderStatus().then((s) => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [])

  function update(patch) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  function handleSave() {
    onSave(draft)
    onClose()
  }

  // Demo is always available; live providers depend on a server-side key. While
  // probing (status === null) we don't disable anything.
  const isAvailable = (id) => id === 'demo' || !status || status[id]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="settings-title">Settings</h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <CloseIcon />
          </button>
        </div>

        <span className="field-label" id="provider-label">
          AI Provider
        </span>
        <div className="provider-grid" role="radiogroup" aria-labelledby="provider-label">
          {PROVIDERS.map((p) => {
            const selected = draft.provider === p.id
            const available = isAvailable(p.id)
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!available}
                className={`provider-card ${selected ? 'selected' : ''} ${available ? '' : 'unavailable'}`}
                onClick={() => update({ provider: p.id })}
              >
                <strong>{p.name}</strong>
                <span>{available ? p.sub : 'Not configured on server'}</span>
              </button>
            )
          })}
        </div>

        <p className="field-note">
          API keys are configured on the server and never sent from your browser. Demo mode runs
          fully offline with no key. To enable OpenAI or Claude, set the matching key in the
          server&apos;s environment.
        </p>

        <label className="field-label" htmlFor="cardCount">
          Cards per set
        </label>
        <div className="range-row">
          <input
            id="cardCount"
            type="range"
            min="3"
            max="20"
            value={draft.cardCount}
            onChange={(e) => update({ cardCount: Number(e.target.value) })}
          />
          <span className="range-value" aria-live="polite">
            {draft.cardCount}
          </span>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
