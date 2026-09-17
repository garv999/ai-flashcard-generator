import {
  SettingsIcon,
  LogInIcon,
  LogOutIcon,
  UserIcon,
  BellIcon,
  SearchIcon,
  CloseIcon,
  SparklesIcon,
} from './Icons.jsx'

// Top bar, composed to match the design reference: a real search field on the
// left, a small cluster of controls on the right (provider/settings, insights,
// profile). Every control performs a real action — the search genuinely filters,
// and no dead/decorative buttons are added. Analytics, AI Coach and Settings are
// ALSO reachable from the sidebar; here we keep the provider status, insights and
// authentication, which the reference surfaces in the header.
export default function Header({
  provider,
  query,
  onSearch,
  searchMode = 'keyword',
  onSearchMode,
  onOpenSettings,
  onOpenIntelligence,
  user,
  onSignIn,
  onLogout,
  authBusy,
}) {
  const semantic = searchMode === 'semantic'
  const isLive = provider !== 'demo'
  const label = provider === 'gemini' ? 'Gemini' : 'Demo mode'
  const displayName = user?.displayName || user?.email || 'Account'

  return (
    <header className="header">
      <div className="header-search">
        <SearchIcon aria-hidden="true" />
        <input
          type="search"
          className="header-search-input"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search decks, topics, cards…"
          aria-label="Search decks, topics and flashcards"
        />
        {query && (
          <button
            type="button"
            className="header-search-clear"
            onClick={() => onSearch('')}
            aria-label="Clear search"
          >
            <CloseIcon />
          </button>
        )}
        {/* Keyword ⇄ Semantic toggle. Semantic uses vector embeddings to match by
            meaning; keyword matches exact text. */}
        <button
          type="button"
          className={`header-search-mode${semantic ? ' semantic' : ''}`}
          onClick={() => onSearchMode?.(semantic ? 'keyword' : 'semantic')}
          aria-pressed={semantic}
          title={semantic ? 'Semantic search (by meaning) — click for keyword' : 'Keyword search — click for semantic (by meaning)'}
        >
          <SparklesIcon />
          <span>{semantic ? 'Semantic' : 'Keyword'}</span>
        </button>
      </div>

      <div className="header-actions">
        <button
          className="settings-btn"
          onClick={onOpenSettings}
          aria-label={`Settings — current provider: ${label}`}
          title="Settings"
        >
          <span className={`status-dot ${isLive ? 'live' : 'demo'}`} aria-hidden="true" />
          {label}
          <SettingsIcon className="gear" />
        </button>

        <button
          className="icon-btn"
          onClick={onOpenIntelligence}
          aria-label="Learning insights"
          title="Learning insights"
        >
          <BellIcon />
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
