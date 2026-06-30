import { useState } from 'react'

export default function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings)

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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="field-label">AI Provider</label>
        <div className="provider-grid">
          {[
            { id: 'demo', name: 'Demo', sub: 'No key needed' },
            { id: 'openai', name: 'OpenAI', sub: 'gpt-4o-mini' },
            { id: 'anthropic', name: 'Claude', sub: 'claude-sonnet-5' },
          ].map((p) => (
            <button
              key={p.id}
              className={`provider-card ${draft.provider === p.id ? 'selected' : ''}`}
              onClick={() => update({ provider: p.id })}
            >
              <strong>{p.name}</strong>
              <span>{p.sub}</span>
            </button>
          ))}
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
              Your key is saved in localStorage and sent directly to the provider from
              your browser. Never commit it to a public repo.
            </p>
          </>
        )}

        <label className="field-label" htmlFor="cardCount">
          Cards per set: <strong>{draft.cardCount}</strong>
        </label>
        <input
          id="cardCount"
          type="range"
          min="3"
          max="20"
          value={draft.cardCount}
          onChange={(e) => update({ cardCount: Number(e.target.value) })}
        />

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
