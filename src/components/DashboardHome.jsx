import { useState } from 'react'
import { CardsIcon, LayersIcon, BrainIcon, FlameIcon, SparklesIcon, TrashIcon } from './Icons.jsx'
import { deckDueCount } from '../services/srs.js'

// Tiny inline sparkline. Purely decorative shape — no data plumbing.
function Spark({ points, tone = 'accent' }) {
  const d = points
    .map((y, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * 96} ${26 - y * 22}`)
    .join(' ')
  return (
    <svg className={`dstat-spark tone-${tone}`} viewBox="0 0 96 26" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A deck's colour tile cycles through the palette so the grid reads like the
// reference, keyed off the deck's position (stable per list order).
const TILE_TONES = ['indigo', 'green', 'amber', 'blue']

function DeckCard({ set, index, isActive, onSelect, onDelete }) {
  const total = set.cards?.length || 0
  const due = deckDueCount(set, Date.now())
  // Progress = share of the deck that is NOT currently due for review.
  const pct = total ? Math.round(((total - due) / total) * 100) : 0
  return (
    <article className={`ddeck${isActive ? ' active' : ''}`}>
      <button type="button" className="ddeck-hit" onClick={() => onSelect(set.id)} aria-current={isActive ? 'true' : undefined}>
        <span className={`ddeck-tile tone-${TILE_TONES[index % TILE_TONES.length]}`} aria-hidden="true">
          <CardsIcon />
        </span>
        <span className="ddeck-title" title={set.topic}>
          {set.topic}
        </span>
        <span className="ddeck-sub">
          {total} card{total === 1 ? '' : 's'}
          {set.source === 'pdf' && <span className="ddeck-badge">PDF</span>}
        </span>
        <span className="ddeck-track">
          <span className="ddeck-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="ddeck-pct">{pct}%</span>
      </button>
      <button
        type="button"
        className="ddeck-menu"
        aria-label={`Delete deck: ${set.topic}`}
        title="Delete deck"
        onClick={() => onDelete(set.id)}
      >
        <TrashIcon />
      </button>
    </article>
  )
}

export default function DashboardHome({
  sets,
  stats,
  activeId,
  user,
  query = '',
  onSelect,
  onDelete,
  onNewDeck,
}) {
  const [filter, setFilter] = useState('All')

  // Stats reflect the WHOLE library, not the current search.
  const deckCount = sets.length
  const cardCount = sets.reduce((n, s) => n + (s.cards?.length || 0), 0)
  const due = sets.reduce((n, s) => n + deckDueCount(s, Date.now()), 0)
  const mastery = cardCount ? Math.round(((cardCount - due) / cardCount) * 100) : 0
  const reviews = stats?.totalReviews ?? 0

  const first = (user?.displayName || '').split(' ')[0]

  // Real search: a deck matches when the query appears in its topic OR in any of
  // its flashcards' question/answer text. Case-insensitive, whitespace-trimmed.
  const q = query.trim().toLowerCase()
  const visibleSets = q
    ? sets.filter(
        (s) =>
          s.topic?.toLowerCase().includes(q) ||
          (s.cards || []).some(
            (c) => c.question?.toLowerCase().includes(q) || c.answer?.toLowerCase().includes(q),
          ),
      )
    : sets

  const recent = visibleSets.slice(0, 2)

  return (
    <>
      <header className="dhead">
        <h1>
          Welcome back{first ? `, ${first}` : ''} <span aria-hidden="true">👋</span>
        </h1>
        <p>Let&rsquo;s continue your learning journey.</p>
      </header>

      <section className="dstats" aria-label="Library at a glance">
        <article className="dstat">
          <strong>{deckCount}</strong>
          <span>Decks</span>
          <Spark points={[0.2, 0.35, 0.3, 0.55, 0.45, 0.7, 0.65]} />
        </article>
        <article className="dstat">
          <strong>{cardCount.toLocaleString()}</strong>
          <span>Flashcards</span>
          <Spark points={[0.15, 0.3, 0.5, 0.4, 0.65, 0.6, 0.8]} tone="violet" />
        </article>
        <article className="dstat">
          <strong>{mastery}%</strong>
          <span>Avg. Mastery</span>
          <Spark points={[0.3, 0.45, 0.4, 0.6, 0.55, 0.72, 0.68]} tone="blue" />
        </article>
        <article className="dstat">
          {/* Streak isn't tracked yet — placeholder until it is wired. */}
          <strong>{reviews || 0}</strong>
          <span>Reviews</span>
          <Spark points={[0.25, 0.4, 0.35, 0.5, 0.62, 0.58, 0.75]} tone="amber" />
        </article>
      </section>

      {recent.length > 0 && (
        <section className="dsection" aria-label="Continue studying">
          <div className="dsection-head">
            <h2>Continue Studying</h2>
          </div>
          <div className="dcontinue">
            {recent.map((set, i) => {
              const total = set.cards?.length || 0
              const d = deckDueCount(set, Date.now())
              const pct = total ? Math.round(((total - d) / total) * 100) : 0
              return (
                <button key={set.id} type="button" className="dcont" onClick={() => onSelect(set.id)}>
                  <span className={`ddeck-tile tone-${TILE_TONES[i % TILE_TONES.length]}`} aria-hidden="true">
                    <LayersIcon />
                  </span>
                  <span className="dcont-copy">
                    <strong title={set.topic}>{set.topic}</strong>
                    <em>
                      {total} card{total === 1 ? '' : 's'}
                    </em>
                    <span className="ddeck-track">
                      <span className="ddeck-fill" style={{ width: `${pct}%` }} />
                    </span>
                  </span>
                  <span className="dcont-pct">{pct}%</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      <section className="dsection" id="decks" aria-label="Your decks">
        <div className="dsection-head">
          <h2>Your Decks</h2>
          <button type="button" className="dnew" onClick={onNewDeck}>
            <SparklesIcon />
            New Deck
          </button>
        </div>

        {/* Filter chips are presentational for now — "All" is the live state and
            the rest are placeholders until filtering is implemented. */}
        <div className="dchips" role="group" aria-label="Filter decks">
          {['All', 'Pinned', 'Recent', 'Shared', 'Archived'].map((c) => (
            <button
              key={c}
              type="button"
              className={`dchip${filter === c ? ' active' : ''}`}
              onClick={() => setFilter(c)}
              aria-pressed={filter === c}
            >
              {c}
            </button>
          ))}
        </div>

        {sets.length === 0 ? (
          <p className="dempty">No decks yet — generate one below to get started.</p>
        ) : visibleSets.length === 0 ? (
          <p className="dempty">No decks, topics or cards match &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          <div className="ddeck-grid">
            {visibleSets.map((set, i) => (
              <DeckCard
                key={set.id}
                set={set}
                index={i}
                isActive={set.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
