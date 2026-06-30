import { useState, useEffect, useRef } from 'react'
import { CloseIcon } from './Icons.jsx'

const PROVIDERS = [
  { id: 'demo', name: 'Demo', sub: 'No key needed' },
  { id: 'openai', name: 'OpenAI', sub: 'gpt-4o-mini' },
  { id: 'anthropic', name: 'Claude', sub: 'claude-sonnet-5' },
]

export default function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings)
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

  function update(patch) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  function handleSave() {
    onSave(draft)
    onClose()
  }

  const needsKey = draft.provider !== 'demo'

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
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`provider-card ${selected ? 'selected' : ''}`}
                onClick={() => update({ provider: p.id })}
              >
                <strong>{p.name}</strong>
                <span>{p.sub}</span>
              </button>
            )
          })}
        </div>

        {needsKey && (
          <>
            <label className="field-label" htmlFor="apiKey">
              {draft.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API Key
            </label>
            <input
              id="apiKey"
              type="password"
              className="text-input"
              placeholder="Paste your key (stored only in this browser)"
              value={draft.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
            />
            <p className="field-note">
              Your key is saved in localStorage and sent directly to the provider from your
              browser. Never commit it to a public repository.
            </p>
          </>
        )}

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
