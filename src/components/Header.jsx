import { BoltIcon, SettingsIcon } from './Icons.jsx'

export default function Header({ provider, onOpenSettings }) {
  const isLive = provider !== 'demo'
  const label =
    provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Claude' : 'Demo mode'

  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <BoltIcon />
        </div>
        <div>
          <h1>AI Flashcard Generator</h1>
          <p className="tagline">Turn any topic into a study-ready deck in seconds</p>
        </div>
      </div>

      <button
        className="settings-btn"
        onClick={onOpenSettings}
        aria-label={`Settings — current provider: ${label}`}
      >
        <span className={`status-dot ${isLive ? 'live' : 'demo'}`} aria-hidden="true" />
        {label}
        <SettingsIcon className="gear" />
      </button>
    </header>
  )
}
