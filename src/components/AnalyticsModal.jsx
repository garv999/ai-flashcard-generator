import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CloseIcon,
  FlameIcon,
  CardsIcon,
  ChartIcon,
  TargetIcon,
  SparklesIcon,
  LayersIcon,
  CheckIcon,
  ClockIcon,
  TrendUpIcon,
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
  activitySeries,
} from '../services/analytics.js'
import { learningIntelligence } from '../services/ml/index.js'
import { recommendNext } from '../services/recommend/index.js'
import {
  evaluationReport,
  recordRecommendationImpression,
  recordRecommendationAccepted,
} from '../services/ml/evaluation/index.js'

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

// Premium summary card for the reference's top row. `delta` is optional and
// only rendered when a real value is supplied.
function SummaryCard({ icon, value, label, delta, tone = 'accent' }) {
  return (
    <article className={`an-sum an-sum-${tone}`}>
      <span className="an-sum-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="an-sum-value">{value}</span>
      <span className="an-sum-label">{label}</span>
      {delta != null && <span className="an-sum-delta">{delta}</span>}
    </article>
  )
}

// Study-trend line chart built from REAL daily-review data (activitySeries).
// Pure SVG: area gradient + grid + line + points, with an HTML axis-label row.
function LineChart({ series }) {
  const W = 320
  const H = 120
  const values = series.map((d) => d.r || 0)
  const max = Math.max(1, ...values)
  const n = values.length
  const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W)
  const y = (v) => H - (v / max) * (H - 8) - 4
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L ${W} ${H} L 0 ${H} Z`
  // A handful of evenly-spaced axis labels so long ranges don't crowd.
  const step = Math.max(1, Math.round(n / 7))
  const labels = series
    .map((d, i) => ({ i, txt: d.date.toLocaleDateString(undefined, { weekday: n <= 7 ? 'short' : undefined, month: n > 7 ? 'short' : undefined, day: n > 7 ? 'numeric' : undefined }) }))
    .filter((_, i) => i % step === 0 || i === n - 1)

  return (
    <div className="an-line">
      <svg className="an-line-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Study trend">
        <defs>
          <linearGradient id="an-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(91,95,214,0.28)" />
            <stop offset="100%" stopColor="rgba(91,95,214,0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="an-line-grid" />
        ))}
        <path d={area} fill="url(#an-line-grad)" />
        <path d={line} className="an-line-stroke" fill="none" vectorEffect="non-scaling-stroke" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="2.4" className="an-line-dot" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="an-line-axis" aria-hidden="true">
        {labels.map((l) => (
          <span key={l.i} style={{ left: `${(x(l.i) / W) * 100}%` }}>
            {l.txt}
          </span>
        ))}
      </div>
    </div>
  )
}

// Mastery-distribution donut built from REAL maturityCounts. SVG ring with one
// arc per segment, centre total, and a legend.
function Donut({ segments, total }) {
  const R = 42
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="an-donut">
      <svg viewBox="0 0 120 120" className="an-donut-svg" role="img" aria-label="Mastery distribution">
        <circle cx="60" cy="60" r={R} className="an-donut-track" />
        {total > 0 &&
          segments.map((s) => {
            const frac = s.value / total
            const dash = frac * C
            const el = (
              <circle
                key={s.key}
                cx="60"
                cy="60"
                r={R}
                className={`an-donut-arc an-seg-${s.cls}`}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return el
          })}
        <text x="60" y="55" className="an-donut-total">
          {total}
        </text>
        <text x="60" y="72" className="an-donut-sub">
          cards
        </text>
      </svg>
      <div className="an-donut-legend">
        {segments.map((s) => (
          <span key={s.key} className="an-legend-item">
            <span className={`an-dot an-seg-${s.cls}`} />
            {s.label}
            <strong>{s.value}</strong>
            {total > 0 && <em>{Math.round((s.value / total) * 100)}%</em>}
          </span>
        ))}
      </div>
    </div>
  )
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

export default function AnalyticsModal({ sets, stats, onClose, onStudyDeck }) {
  const closeRef = useRef(null)
  // Local view-only state: how many days the trend chart spans. Reads existing
  // data via activitySeries — no analytics calculations are changed.
  const [range, setRange] = useState(7)

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
  const series = activitySeries(stats, range, now)

  // Forgetting-prediction model output (real values; SRS fallback until trained).
  const li = useMemo(() => learningIntelligence({ sets, now }), [sets, now])
  // Recommendation engine — top ranked cards to study next across all decks.
  const rec = useMemo(() => recommendNext({ sets, stats, now, limit: 5 }), [sets, stats, now])
  // Evaluation report — how the model and recommendations are performing against
  // real outcomes. All sections gate themselves on sufficient data.
  const evalReport = useMemo(() => evaluationReport({ now }), [now])

  // Impression when a non-empty recommendation is shown (for acceptance rate).
  useEffect(() => {
    if (rec.cards.length) {
      try {
        recordRecommendationImpression({ surface: 'analytics' })
      } catch {
        /* best-effort */
      }
    }
  }, [rec])

  const acceptAndStudy = (deckId) => {
    try {
      recordRecommendationAccepted({ recommendation: rec, surface: 'analytics', deckId })
    } catch {
      /* best-effort */
    }
    onStudyDeck?.(deckId)
  }

  // Presentation formatters: never show misleading precision, and render an
  // unavailable metric as "N/A" (distinct from a real 0).
  const fmtPct = (v) => (v == null ? 'N/A' : `${Math.round(v * 100)}%`)
  const fmtDec = (v) => (v == null ? 'N/A' : v.toFixed(2))

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
            {/* ---- Reference overview: range selector, summary cards, charts ---- */}
            <div className="an-report-head">
              <div className="an-range" role="group" aria-label="Trend range">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`an-range-btn${range === d ? ' active' : ''}`}
                    onClick={() => setRange(d)}
                    aria-pressed={range === d}
                  >
                    Last {d} days
                  </button>
                ))}
              </div>
            </div>

            <div className="an-summary">
              <SummaryCard
                icon={<CardsIcon />}
                value={t.reviews.toLocaleString()}
                label="Cards Reviewed"
                tone="accent"
              />
              <SummaryCard
                icon={<TargetIcon />}
                value={ret === null ? '—' : `${Math.round(ret * 100)}%`}
                label="Accuracy"
                tone="green"
              />
              <SummaryCard
                icon={<FlameIcon />}
                value={streak}
                label={`Day Streak${longest > streak ? ` · best ${longest}` : ''}`}
                tone="amber"
              />
              <SummaryCard
                icon={<SparklesIcon />}
                value={maturity.total ? `${Math.round((maturity.mature / maturity.total) * 100)}%` : '—'}
                label="Mastered"
                tone="violet"
              />
            </div>

            <div className="an-charts">
              <section className="an-card an-trend">
                <div className="an-card-head">
                  <h3>
                    <TrendUpIcon className="an-head-icon" />
                    Study Trend
                  </h3>
                  <span className="an-muted">reviews / day</span>
                </div>
                <LineChart series={series} />
              </section>

              <section className="an-card">
                <div className="an-card-head">
                  <h3>
                    <LayersIcon className="an-head-icon" />
                    Mastery Distribution
                  </h3>
                </div>
                <Donut segments={maturitySegs} total={maturity.total} />
              </section>
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

            {/* Recommended focus — recommendation engine's ranked next steps */}
            {rec.cards.length > 0 && (
              <section className="an-section an-rec">
                <div className="an-section-head">
                  <h3>
                    <TargetIcon /> Recommended focus
                  </h3>
                  <span className={`an-ml-tag ${rec.source === 'SRS' ? 'an-ml-tag-srs' : ''}`}>
                    {rec.source === 'ML' ? 'Model-ranked' : 'SRS-ranked'}
                  </span>
                </div>
                <ul className="an-rec-list">
                  {rec.cards.map((c) => (
                    <li key={`${c.deckId}-${c.cardIndex}`} className="an-rec-item">
                      <span className={`an-rec-badge an-rec-${c.type}`}>{c.typeLabel}</span>
                      <span className="an-rec-body">
                        <span className="an-rec-q" title={c.question}>
                          {c.question}
                        </span>
                        <span className="an-rec-reason">
                          {c.deckTopic} · {c.reason}
                        </span>
                      </span>
                      {onStudyDeck && (
                        <button
                          type="button"
                          className="an-rec-study"
                          onClick={() => acceptAndStudy(c.deckId)}
                          title="Study this deck now"
                        >
                          Study
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {rec.topics.length > 0 && (
                  <div className="an-ml-topics">
                    {rec.topics.slice(0, 4).map((tp) => (
                      <span key={tp.deckId} className={`an-ml-topic an-rec-prio-${tp.priority}`}>
                        {tp.topic}
                        <span className="an-ml-topicrisk">{tp.priority}</span>
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Learning intelligence — forgetting-prediction model output */}
            <section className="an-section an-ml">
              <div className="an-section-head">
                <h3>
                  <SparklesIcon /> Learning intelligence
                </h3>
                <span className={`an-ml-tag ${li.available ? '' : 'an-ml-tag-srs'}`}>
                  {li.available ? `Model v${li.modelVersion}` : 'SRS estimate'}
                </span>
              </div>

              {!li.available && <p className="an-ml-note">{li.message}</p>}

              <div className="an-ml-stats">
                <StatTile
                  icon={<TargetIcon />}
                  value={li.highRiskCount}
                  label="Cards at high forgetting risk"
                  accent="again"
                />
                <StatTile
                  icon={<ChartIcon />}
                  value={`${Math.round(li.avgForgetting * 100)}%`}
                  label="Avg predicted forgetting"
                />
                <StatTile
                  icon={<LayersIcon />}
                  value={`${li.coverage}/${li.total}`}
                  label="Cards with enough history"
                />
              </div>

              {li.available && li.valAccuracy != null && (
                <p className="an-ml-note">
                  Validation accuracy {Math.round(li.valAccuracy * 100)}% on held-out reviews (n={li.n}).
                </p>
              )}

              {li.highRisk.length > 0 && (
                <ul className="an-ml-risklist">
                  {li.highRisk.slice(0, 5).map((c) => (
                    <li key={`${c.deckId}-${c.cardIndex}`} className="an-ml-riskitem">
                      <span className="an-ml-riskpct">{Math.round(c.forgettingProbability * 100)}%</span>
                      <span className="an-ml-riskbody">
                        <span className="an-ml-riskq" title={c.question}>
                          {c.question}
                        </span>
                        <span className="an-ml-riskreason">
                          {c.deckTopic} · {c.reasons[0]}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {li.highRiskTopics.length > 0 && (
                <div className="an-ml-topics">
                  {li.highRiskTopics.slice(0, 4).map((tp) => (
                    <span key={tp.deckId} className="an-ml-topic">
                      {tp.topic}
                      <span className="an-ml-topicrisk">{Math.round(tp.avgRisk * 100)}%</span>
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Model evaluation — measured against real review outcomes */}
            <section className="an-section an-eval">
              <div className="an-section-head">
                <h3>
                  <ChartIcon /> Model evaluation
                </h3>
                <span className="an-ml-tag an-ml-tag-srs">
                  {evalReport.coverage.evaluatedPredictions} evaluated
                </span>
              </div>

              {/* Model performance */}
              {evalReport.modelPerformance.available ? (
                <>
                  <h4 className="an-eval-sub">
                    Model performance
                    {evalReport.modelPerformance.modelVersions?.length
                      ? ` · model v${evalReport.modelPerformance.modelVersions.join(', v')}`
                      : ''}
                  </h4>
                  <div className="an-ml-stats">
                    <StatTile icon={<ChartIcon />} value={fmtDec(evalReport.modelPerformance.metrics.rocAuc)} label="ROC-AUC" />
                    <StatTile icon={<ChartIcon />} value={fmtDec(evalReport.modelPerformance.metrics.prAuc)} label="PR-AUC" />
                    <StatTile icon={<ChartIcon />} value={fmtPct(evalReport.modelPerformance.metrics.f1)} label="F1 score" />
                    <StatTile icon={<ChartIcon />} value={fmtDec(evalReport.modelPerformance.metrics.brier)} label="Brier score" />
                  </div>
                </>
              ) : (
                <p className="an-ml-note">
                  Not enough evaluation data yet ({evalReport.modelPerformance.n}/{evalReport.modelPerformance.min} predictions).
                </p>
              )}

              {/* Calibration */}
              {evalReport.calibration.available && (
                <>
                  <h4 className="an-eval-sub">Calibration (predicted vs observed forgetting)</h4>
                  <ul className="an-cal">
                    {evalReport.calibration.buckets.map((b) => (
                      <li key={b.label} className="an-cal-row">
                        <span className="an-cal-band">{b.label}</span>
                        <span className="an-cal-track" title={`Avg predicted ${fmtPct(b.avgPredicted)}`}>
                          <span className="an-cal-pred" style={{ width: `${(b.avgPredicted || 0) * 100}%` }} />
                          {b.observedRate != null && (
                            <span className="an-cal-obs" style={{ left: `${b.observedRate * 100}%` }} />
                          )}
                        </span>
                        <span className="an-cal-num">
                          {b.observedRate != null ? `${fmtPct(b.observedRate)} obs` : `${b.count} preds`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {/* ML vs SRS */}
              <h4 className="an-eval-sub">ML vs SRS</h4>
              {evalReport.mlVsSrs.available ? (
                <div className="an-eval-vs">
                  <div className="an-eval-col">
                    <span className="an-eval-col-h">ML</span> ROC-AUC {fmtDec(evalReport.mlVsSrs.ml.rocAuc)} · Brier{' '}
                    {fmtDec(evalReport.mlVsSrs.ml.brier)}
                  </div>
                  <div className="an-eval-col">
                    <span className="an-eval-col-h">SRS</span> ROC-AUC {fmtDec(evalReport.mlVsSrs.srs.rocAuc)} · Brier{' '}
                    {fmtDec(evalReport.mlVsSrs.srs.brier)}
                  </div>
                </div>
              ) : (
                <p className="an-ml-note">{evalReport.mlVsSrs.message}</p>
              )}

              {/* Recommendation outcomes */}
              <h4 className="an-eval-sub">Recommendation outcomes (observed)</h4>
              {evalReport.recommendations.available ? (
                <div className="an-ml-stats">
                  <StatTile icon={<TargetIcon />} value={fmtPct(evalReport.recommendations.acceptanceRate)} label="Acceptance rate" />
                  <StatTile icon={<CheckIcon />} value={fmtPct(evalReport.recommendations.observedSuccessRate)} label="Observed success" />
                  <StatTile icon={<ChartIcon />} value={fmtPct(evalReport.recommendations.observedLapseRate)} label="Observed lapse" />
                </div>
              ) : (
                <p className="an-ml-note">{evalReport.recommendations.message}</p>
              )}

              {/* Coverage */}
              <p className="an-eval-cov">
                {evalReport.coverage.evaluatedPredictions} predictions evaluated ·{' '}
                {evalReport.coverage.totalReviewEvents} review events · ML coverage{' '}
                {fmtPct(evalReport.coverage.mlCoverage)}
              </p>
            </section>
          </>
        )}

        <p className="an-foot">Your progress is saved on this device.</p>
      </div>
    </div>
  )
}
