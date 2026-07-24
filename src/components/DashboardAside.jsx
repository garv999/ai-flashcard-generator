import { BrainIcon, TargetIcon, ClockIcon } from './Icons.jsx'
import { deckDueCount } from '../services/srs.js'

// Right-hand utility column from the reference: AI Coach, Today's Goal and
// Study Time. Real values are used where the app already computes them; the
// rest are clearly-marked placeholders.
export default function DashboardAside({ sets, stats, onOpenCoach }) {
  const now = Date.now()
  const due = sets.reduce((n, s) => n + deckDueCount(s, now), 0)
  const goal = Math.max(due, 50)
  const done = Math.max(goal - due, 0)
  const pct = goal ? Math.round((done / goal) * 100) : 0

  const reviews = stats?.totalReviews ?? 0

  return (
    <aside className="daside" aria-label="Study overview">
      <button type="button" className="dcoach" onClick={onOpenCoach}>
        <span className="dcoach-avatar" aria-hidden="true">
          <BrainIcon />
        </span>
        <span className="dcoach-copy">
          <strong>AI Coach</strong>
          <em>Always here to help you learn better.</em>
        </span>
      </button>

      <article className="dpanel">
        <span className="dpanel-head">
          <TargetIcon />
          <strong>Today&rsquo;s Goal</strong>
        </span>
        <span className="dpanel-value">
          {done} / {goal} cards
        </span>
        <span className="ddeck-track">
          <span className="ddeck-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="dpanel-meta">{pct}%</span>
      </article>

      <article className="dpanel">
        <span className="dpanel-head">
          <ClockIcon />
          <strong>Study Time</strong>
        </span>
        {/* Session duration isn't tracked yet — placeholder until it is. */}
        <span className="dpanel-value">{reviews ? `${reviews} reviews` : '—'}</span>
        <span className="dpanel-meta dpanel-up">Keep the streak going</span>
        <svg className="dstat-spark tone-blue" viewBox="0 0 96 26" preserveAspectRatio="none">
          <path
            d="M1 20 L14 15 L27 18 L40 9 L53 13 L66 6 L79 10 L95 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </article>
    </aside>
  )
}
