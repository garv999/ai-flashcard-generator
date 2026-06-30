export default function Header({ provider, onOpenSettings }) {
  const label =
    provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Claude' : 'Demo mode'

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">⚡</span>
        <div>
          <h1>AI Flashcard Generator</h1>
          <p className="tagline">Turn any topic into a study-ready deck in seconds</p>
        </div>
      </div>
      <button className="settings-btn" onClick={onOpenSettings}>
        <span className={`status-dot ${provider === 'demo' ? 'demo' : 'live'}`} />
        {label}
        <span className="gear">⚙</span>
      </button>
    </header>
  )
}
