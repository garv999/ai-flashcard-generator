import {
  LogoMark,
  LayersIcon,
  CardsIcon,
  SparklesIcon,
  BrainIcon,
  TargetIcon,
  ChartIcon,
  MessageIcon,
  SettingsIcon,
  ChevronRightIcon,
  UserIcon,
} from './Icons.jsx'

// Left navigation rail, composed to match the design reference.
//
// Presentation only: there is no router in this app, so each item either scrolls
// to the section that already renders that view, or calls the handler the app
// already exposes for it (analytics / coach / settings modals). No routes, no
// state management and no business logic are introduced here.
export default function DashboardNav({
  user,
  active = 'home',
  onNavigate,
  onOpenAnalytics,
  onOpenCoach,
  onOpenSettings,
}) {
  const items = [
    { id: 'home', label: 'Home', Icon: LayersIcon, go: () => onNavigate?.('top') },
    { id: 'decks', label: 'Decks', Icon: CardsIcon, go: () => onNavigate?.('decks') },
    { id: 'generate', label: 'Generate', Icon: SparklesIcon, go: () => onNavigate?.('generate') },
    { id: 'study', label: 'Study', Icon: BrainIcon, go: () => onNavigate?.('study') },
    { id: 'quiz', label: 'Quiz', Icon: TargetIcon, go: () => onNavigate?.('study') },
    { id: 'analytics', label: 'Analytics', Icon: ChartIcon, go: onOpenAnalytics },
    { id: 'coach', label: 'AI Coach', Icon: MessageIcon, go: onOpenCoach },
    { id: 'settings', label: 'Settings', Icon: SettingsIcon, go: onOpenSettings },
  ]

  const name = user?.displayName || user?.email || 'Demo mode'
  const plan = user ? 'Synced to cloud' : 'Saved on this device'

  return (
    <aside className="dnav" aria-label="Workspace navigation">
      <div className="dnav-brand">
        <span className="dnav-mark" aria-hidden="true">
          <LogoMark />
        </span>
        <span className="dnav-name">
          AI Flashcard
          <br />
          Generator
        </span>
      </div>

      <nav className="dnav-items">
        {items.map(({ id, label, Icon, go }) => (
          <button
            key={id}
            type="button"
            className={`dnav-item${active === id ? ' active' : ''}`}
            onClick={go}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="dnav-user">
        <span className="dnav-avatar" aria-hidden="true">
          {user?.photoURL ? <img src={user.photoURL} alt="" /> : <UserIcon />}
        </span>
        <span className="dnav-user-copy">
          <strong title={name}>{name}</strong>
          <em>{plan}</em>
        </span>
        <ChevronRightIcon />
      </div>
    </aside>
  )
}
