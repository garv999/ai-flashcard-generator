import { useEffect, useRef } from 'react'
import {
  CloseIcon,
  FlameIcon,
  CardsIcon,
  ChartIcon,
  TargetIcon,
  SparklesIcon,
  LayersIcon,
  CheckIcon,
} from './Icons.jsx'
import {
  totals,
  currentStreak,
  longestStreak,
  retention,
  reviewsOn,
  dayKey,
  maturityCounts,
  avgEase,
  deckProgress,
  quizStats,
} from '../services/analytics.js'

const WEEKS = 13

// Build a GitHub-style day grid for the last WEEKS weeks, aligned so each
// column is a Sun→Sat week.
function buildHeatmap(stats, now) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(start.getDate() - (WEEKS * 7 - 1))
  start.setDate(start.getDate() - start.getDay()) // back to Sunday

  const cells = []
  const cur = new Date(start)
  while (cur <= today) {
    const key = dayKey(cur.getTime())
    cells.push({ key, count: stats?.days?.[key]?.r || 0 })
    cur.setDate(cur.getDate() + 1)
  }
  while (cells.length % 7 !== 0) cells.push({ key: null, count: 0, pad: true })
  return cells
}

function heatLevel(count) {
  if (count <= 0) return 0
  if (count < 4) return 1
  if (count < 10) return 2
  if (count < 20) return 3
  return 4
}

// Short, locale-aware date for a quiz attempt's ISO timestamp. Returns '' when
// the value is missing or unparseable so the UI can hide it gracefully.
function formatAttemptDate(at) {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatTile({ icon, value, label, accent }) {
  return (
    <div className={`an-tile ${accent ? 'an-tile-accent' : ''}`}>
      <span className="an-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="an-tile-value">{value}</span>
      <span className="an-tile-label">{label}</span>
    </div>
  )
}

// Horizontal stacked bar from an array of { key, label, value, cls }.
function StackBar({ segments, total }) {
  if (!total) return <div className="an-stack an-stack-empty" />
  return (
    <div className="an-stack" role="img" aria-label="Distribution">
      {segments.map((s) =>
        s.value > 0 ? (
          <span
            key={s.key}
            className={`an-seg an-seg-${s.cls}`}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ) : null,
      )}
    </div>
  )
}

function Legend({ segments, total }) {
  return (
    <div className="an-legend">
      {segments.map((s) => (
        <span key={s.key} className="an-legend-item">
          <span className={`an-dot an-seg-${s.cls}`} />
          {s.label}
          <strong>{s.value}</strong>
          {total > 0 && <em>{Math.round((s.value / total) * 100)}%</em>}
        </span>
      ))}
    </div>
  )
}

export default function AnalyticsModal({ sets, stats, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const now = Date.now()
  const t = totals(stats)
  const streak = currentStreak(stats, now)
  const longest = longestStreak(stats)
  const ret = retention(stats)
  const todayCount = reviewsOn(stats, dayKey(now))
  const maturity = maturityCounts(sets)
  const ease = avgEase(sets)
  const heat = buildHeatmap(stats, now)

  const ratingSegs = [
    { key: 'again', label: 'Again', value: t.again, cls: 'again' },
    { key: 'hard', label: 'Hard', value: t.hard, cls: 'hard' },
    { key: 'good', label: 'Good', value: t.good, cls: 'good' },
    { key: 'easy', label: 'Easy', value: t.easy, cls: 'easy' },
  ]
  const maturitySegs = [
    { key: 'new', label: 'New', value: maturity.new, cls: 'new' },
    { key: 'learning', label: 'Learning', value: maturity.learning, cls: 'learning' },
    { key: 'young', label: 'Young', value: maturity.young, cls: 'young' },
    { key: 'mature', label: 'Mature', value: maturity.mature, cls: 'mature' },
  ]

  const deckRows = (sets || [])
    .map((s) => ({ id: s.id, topic: s.topic, ...deckProgress(s) }))
    .sort((a, b) => b.masteryPct - a.masteryPct)

  const quiz = quizStats(sets)

  const nothingYet = t.reviews === 0 && maturity.total === 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal analytics-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-title"
        onClick={(e) => e.stopPropagation()}
        // Opt this scroll container out of Lenis so the mouse wheel, trackpad and
        // touch scroll it natively instead of being hijacked to the page behind.
        data-lenis-prevent
      >
        <div className="modal-head">
          <h2 id="analytics-title">Study analytics</h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close analytics"
          >
            <CloseIcon />
          </button>
        </div>

        {nothingYet ? (
          <div className="an-empty">
            <div className="an-empty-art" aria-hidden="true">
              <ChartIcon />
            </div>
            <h3>No progress yet</h3>
            <p>Generate a deck and review some cards — your streak, retention and mastery will appear here.</p>
          </div>
        ) : (
          <>
            {/* Headline tiles */}
            <div className="an-tiles">
              <StatTile
                icon={<FlameIcon />}
                value={streak}
                label={`day streak${streak === 1 ? '' : ''}`}
                accent
              />
              <StatTile icon={<CardsIcon />} value={todayCount} label="reviews today" />
              <StatTile icon={<ChartIcon />} value={t.reviews.toLocaleString()} label="total reviews" />
              <StatTile
                icon={<TargetIcon />}
                value={ret === null ? '—' : `${Math.round(ret * 100)}%`}
                label="retention"
              />
            </div>

            {/* Activity heatmap */}
            <section className="an-section">
              <div className="an-section-head">
                <h3>Activity · last {WEEKS} weeks</h3>
                <span className="an-muted">{t.daysStudied} active day{t.daysStudied === 1 ? '' : 's'}</span>
              </div>
              <div className="an-heatmap" aria-hidden="true">
                {heat.map((c, i) => (
                  <span
                    key={c.key || `pad-${i}`}
                    className={`an-cell an-cell-${c.pad ? 0 : heatLevel(c.count)}`}
                    title={c.key ? `${c.key}: ${c.count} review${c.count === 1 ? '' : 's'}` : ''}
                  />
                ))}
              </div>
              <div className="an-heat-legend">
                <span>Less</span>
                <span className="an-cell an-cell-0" />
                <span className="an-cell an-cell-1" />
                <span className="an-cell an-cell-2" />
                <span className="an-cell an-cell-3" />
                <span className="an-cell an-cell-4" />
                <span>More</span>
              </div>
            </section>

            {/* Two-column: rating mix + card maturity */}
            <div className="an-grid2">
              <section className="an-section">
                <div className="an-section-head">
                  <h3>Answer mix</h3>
                  <TargetIcon className="an-head-icon" />
                </div>
                <StackBar segments={ratingSegs} total={t.reviews} />
                <Legend segments={ratingSegs} total={t.reviews} />
              </section>

              <section className="an-section">
                <div className="an-section-head">
                  <h3>Card maturity</h3>
                  <LayersIcon className="an-head-icon" />
                </div>
                <StackBar segments={maturitySegs} total={maturity.total} />
                <Legend segments={maturitySegs} total={maturity.total} />
              </section>
            </div>

            {/* Quiz performance */}
            <section className="an-section">
              <div className="an-section-head">
                <h3>Quiz performance</h3>
                <CheckIcon className="an-head-icon" />
              </div>
              {quiz.count === 0 ? (
                <p className="an-quiz-empty">
                  No quizzes taken yet — finish a quiz on any deck to see your best and latest scores here.
                </p>
              ) : (
                <>
                  <div className="an-quiz-tiles">
                    <div className="an-mini">
                      <CheckIcon />
                      <span>{quiz.count}</span> deck{quiz.count === 1 ? '' : 's'} quizzed
                    </div>
                    <div className="an-mini">
                      <TargetIcon />
                      <span>{quiz.avgBest}%</span> avg best
                    </div>
                    <div className="an-mini">
                      <SparklesIcon />
                      <span>{quiz.topBest}%</span> top score
                    </div>
                  </div>
                  <ul className="an-decks">
                    {quiz.decks.map((d) => {
                      const when = formatAttemptDate(d.last.at)
                      return (
                        <li key={d.id} className="an-deck">
                          <div className="an-deck-top">
                            <span className="an-deck-topic" title={d.topic}>
                              {d.topic}
                            </span>
                            <span className="an-deck-pct">{d.best.pct}%</span>
                          </div>
                          <div className="an-deck-bar">
                            <span className="an-deck-fill" style={{ width: `${d.best.pct}%` }} />
                          </div>
                          <span className="an-deck-sub">
                            Best {d.best.correct}/{d.best.total} · Last {d.last.pct}% ({d.last.correct}/
                            {d.last.total}){when ? ` · ${when}` : ''}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>

            {/* Secondary summary */}
            <div className="an-summary">
              <div className="an-mini">
                <SparklesIcon />
                <span>{maturity.mature}</span> mastered
              </div>
              <div className="an-mini">
                <FlameIcon />
                <span>{longest}</span> longest streak
              </div>
              <div className="an-mini">
                <CardsIcon />
                <span>{maturity.total - maturity.new}</span> in progress
              </div>
              <div className="an-mini">
                <TargetIcon />
                <span>{ease ? ease.toFixed(2) : '—'}</span> avg ease
              </div>
            </div>

            {/* Per-deck progress */}
            {deckRows.length > 0 && (
              <section className="an-section">
                <div className="an-section-head">
                  <h3>Deck mastery</h3>
                </div>
                <ul className="an-decks">
                  {deckRows.map((d) => (
                    <li key={d.id} className="an-deck">
                      <div className="an-deck-top">
                        <span className="an-deck-topic" title={d.topic}>
                          {d.topic}
                        </span>
                        <span className="an-deck-pct">{d.masteryPct}%</span>
                      </div>
                      <div className="an-deck-bar">
                        <span className="an-deck-fill" style={{ width: `${d.masteryPct}%` }} />
                      </div>
                      <span className="an-deck-sub">
                        {d.mature} mature · {d.young} young · {d.learning} learning · {d.new} new
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <p className="an-foot">Your progress is saved on this device.</p>
      </div>
    </div>
  )
}
