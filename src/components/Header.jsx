import { BoltIcon, SettingsIcon, LogInIcon, LogOutIcon, UserIcon } from './Icons.jsx'

export default function Header({ provider, onOpenSettings, user, onSignIn, onLogout, authBusy }) {
  const isLive = provider !== 'demo'
  const label =
    provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Claude' : 'Demo mode'

  const displayName = user?.displayName || user?.email || 'Account'

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

      <div className="header-actions">
        <button
          className="settings-btn"
          onClick={onOpenSettings}
          aria-label={`Settings — current provider: ${label}`}
        >
          <span className={`status-dot ${isLive ? 'live' : 'demo'}`} aria-hidden="true" />
          {label}
          <SettingsIcon className="gear" />
        </button>

        {user ? (
          <div className="user-area">
            <span className="user-chip" title={user.email || displayName}>
              {user.photoURL ? (
                <img className="user-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="user-avatar user-avatar-fallback" aria-hidden="true">
                  <UserIcon />
                </span>
              )}
              <span className="user-name">{displayName}</span>
            </span>
            <button
              className="icon-btn"
              onClick={onLogout}
              disabled={authBusy}
              aria-label="Log out"
              title="Log out"
            >
              <LogOutIcon />
            </button>
          </div>
        ) : (
          <button className="signin-btn" onClick={onSignIn} disabled={authBusy}>
            <LogInIcon />
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}
