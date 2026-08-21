import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  buildPlan,
  validatePlanConfig,
  defaultTargetDate,
  toDateInput,
  CONFIDENCE_LEVELS,
  DAILY_TIME_OPTIONS,
} from '../services/studyPlan.js'
import { recommendNext } from '../services/recommend/index.js'
import {
  recordRecommendationImpression,
  recordRecommendationAccepted,
} from '../services/ml/evaluation/index.js'
import {
  RouteIcon,
  CalendarIcon,
  ClockIcon,
  TargetIcon,
  CardsIcon,
  SparklesIcon,
  CheckIcon,
  RotateIcon,
  AlertIcon,
  ChevronLeftIcon,
} from './Icons.jsx'

const UPCOMING_DAYS = 10 // rows shown in the schedule preview

const fmtDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const fmtLongDate = (ms) =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

const STATUS_COPY = {
  ahead: { label: 'Ahead of schedule', cls: 'ahead' },
  'on-track': { label: 'On track', cls: 'ontrack' },
  behind: { label: 'Behind — pick up the pace', cls: 'behind' },
}

// Circular progress dial (SVG, no dependencies) — mirrors the quiz ScoreRing.
function MasteryRing({ pct }) {
  const R = 52
  const C = 2 * Math.PI * R
  const offset = C * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg className="plan-ring" viewBox="0 0 120 120" role="img" aria-label={`Mastery ${pct}%`}>
      <circle className="plan-ring-track" cx="60" cy="60" r={R} />
      <circle
        className="plan-ring-fill"
        cx="60"
        cy="60"
        r={R}
        style={{ strokeDasharray: C, strokeDashoffset: offset }}
      />
      <text className="plan-ring-value" x="60" y="54" dominantBaseline="central" textAnchor="middle">
        {pct}%
      </text>
      <text className="plan-ring-label" x="60" y="76" dominantBaseline="central" textAnchor="middle">
        mastered
      </text>
    </svg>
  )
}

function StatTile({ icon, value, label }) {
  return (
    <div className="plan-tile">
      <span className="plan-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="plan-tile-value">{value}</span>
      <span className="plan-tile-label">{label}</span>
    </div>
  )
}

// --- Setup form -----------------------------------------------------------
function PlanSetup({ deck, initial, onSubmit, onCancel }) {
  const today = toDateInput(Date.now())
  const [targetDate, setTargetDate] = useState(initial?.targetDate || defaultTargetDate())
  const [dailyMinutes, setDailyMinutes] = useState(initial?.dailyMinutes || 20)
  const [confidence, setConfidence] = useState(initial?.confidence || 'low')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const cfg = { targetDate, dailyMinutes, confidence }
    const { ok, error: err } = validatePlanConfig(cfg)
    if (!ok) {
      setError(err)
      return
    }
    onSubmit({ ...cfg, createdAt: initial?.createdAt || new Date().toISOString() })
  }

  return (
    <form className="plan-setup" onSubmit={submit}>
      <div className="plan-setup-head">
        <span className="plan-setup-icon" aria-hidden="true">
          <RouteIcon />
        </span>
        <div>
          <h3>Build your study plan</h3>
          <p>
            We’ll turn “{deck.topic}” into a day-by-day roadmap that adapts as you study.
          </p>
        </div>
      </div>

      <label className="plan-field">
        <span className="plan-field-label">
          <CalendarIcon /> Target date
        </span>
        <input
          type="date"
          className="plan-date"
          min={today}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          required
        />
        <span className="plan-field-hint">When is your exam, interview, or deadline?</span>
      </label>

      <div className="plan-field">
        <span className="plan-field-label">
          <ClockIcon /> Daily study time
        </span>
        <div className="plan-chips" role="group" aria-label="Daily study time">
          {DAILY_TIME_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              className={`plan-chip ${dailyMinutes === m ? 'active' : ''}`}
              aria-pressed={dailyMinutes === m}
              onClick={() => setDailyMinutes(m)}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div className="plan-field">
        <span className="plan-field-label">
          <TargetIcon /> How well do you know this?
        </span>
        <div className="plan-levels" role="radiogroup" aria-label="Confidence level">
          {CONFIDENCE_LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={confidence === l.key}
              className={`plan-level ${confidence === l.key ? 'active' : ''}`}
              onClick={() => setConfidence(l.key)}
            >
              <span className="plan-level-label">{l.label}</span>
              <span className="plan-level-hint">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="plan-error" role="alert">
          {error}
        </p>
      )}

      <div className="plan-setup-actions">
        <button type="submit" className="btn-primary plan-action">
          <SparklesIcon />
          {initial ? 'Update plan' : 'Create plan'}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost plan-action" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}

// Risk bucket for a forgetting probability (drives the badge color).
const riskBucket = (p) => (p >= 0.6 ? 'high' : p >= 0.35 ? 'med' : 'low')

// --- Dashboard ------------------------------------------------------------
function PlanDashboard({ plan, recommendation, onEdit, onReset, onStudy }) {
  // Top recommendations for this deck (engine-ranked). Surface only the ones
  // worth acting on now (due, or elevated forgetting risk).
  const recs = (recommendation?.cards || []).filter((c) => c.due || c.forgettingProbability >= 0.5).slice(0, 4)
  const recSource = recommendation?.source // 'ML' | 'SRS'
  const status = STATUS_COPY[plan.status] || STATUS_COPY['on-track']
  const today = plan.today
  const daysLeftLabel = plan.past
    ? 'Target reached'
    : plan.daysLeft === 0
      ? 'Today'
      : `${plan.daysLeft} day${plan.daysLeft === 1 ? '' : 's'}`

  // Upcoming schedule: from today, drop trailing empty days.
  const upcoming = useMemo(() => {
    const slice = plan.days.slice(0, UPCOMING_DAYS)
    while (slice.length > 1 && slice[slice.length - 1].load === 0) slice.pop()
    return slice
  }, [plan])
  const maxLoad = Math.max(1, ...upcoming.map((d) => d.load))

  return (
    <div className="plan-dash">
      {/* Goal header */}
      <div className="plan-goal">
        <div className="plan-goal-main">
          <span className="plan-goal-icon" aria-hidden="true">
            <TargetIcon />
          </span>
          <div>
            <p className="plan-goal-date">{fmtLongDate(plan.targetMs)}</p>
            <p className="plan-goal-sub">
              {daysLeftLabel} · {plan.newPerDay > 0 ? `${plan.newPerDay} new/day` : 'review only'} ·
              ~{plan.avgMinutes} min/day
            </p>
          </div>
        </div>
        <div className="plan-goal-actions">
          <span className={`plan-status plan-status-${status.cls}`}>{status.label}</span>
          <button type="button" className="plan-mini-btn" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="plan-mini-btn plan-mini-danger" onClick={onReset}>
            Reset
          </button>
        </div>
      </div>

      {plan.overCapacity && (
        <p className="plan-warn" role="status">
          <AlertIcon />
          <span>
            There isn’t enough time to introduce every card by your target at {plan.level.label.toLowerCase()} pace.
            Add more daily time or push the date out.
          </span>
        </p>
      )}

      {/* Progress + today's focus */}
      <div className="plan-progress">
        <MasteryRing pct={plan.masteryPct} />
        <div className="plan-progress-body">
          <div className="plan-progress-row">
            <span className="plan-progress-num">{plan.started}</span>
            <span className="plan-progress-txt">
              of {plan.total} cards started · {plan.mastered} mastered
            </span>
          </div>
          <div className="plan-track" aria-hidden="true">
            <div className="plan-track-started" style={{ width: `${plan.startedPct}%` }} />
            <div className="plan-track-mastered" style={{ width: `${plan.masteryPct}%` }} />
          </div>
          <div className="plan-today">
            <span className="plan-today-tag">Today</span>
            {today.load > 0 ? (
              <span className="plan-today-body">
                {today.newCards > 0 && <strong>{today.newCards} new</strong>}
                {today.newCards > 0 && today.reviews > 0 && ' · '}
                {today.reviews > 0 && <strong>{today.reviews} reviews</strong>}
                {' · ~'}
                {today.minutes} min
                {plan.reviewedToday > 0 && (
                  <span className="plan-today-done">
                    <CheckIcon /> {plan.reviewedToday} done
                  </span>
                )}
              </span>
            ) : (
              <span className="plan-today-body plan-today-rest">
                Nothing scheduled — you’re caught up for today.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Recommended next — engine-ranked cards to study first */}
      {recs.length > 0 && (
        <div className="plan-section plan-priority">
          <h4 className="plan-section-title">
            Recommended next
            <span
              className={`plan-ml-tag ${recSource === 'SRS' ? 'plan-ml-tag-srs' : ''}`}
              title={
                recSource === 'ML'
                  ? 'Ranked by the personalized forgetting-prediction model'
                  : 'Ranked by SRS signals until the model has enough history to train'
              }
            >
              {recSource}
            </span>
            {onStudy && (
              <button type="button" className="plan-mini-btn plan-rec-study" onClick={onStudy}>
                Study
              </button>
            )}
          </h4>
          <ul className="plan-priority-list">
            {recs.map((c) => (
              <li key={c.cardIndex} className="plan-priority-item">
                <span
                  className={`plan-risk plan-risk-${riskBucket(c.forgettingProbability)}`}
                  title="Estimated chance of forgetting at the next review"
                >
                  {Math.round(c.forgettingProbability * 100)}%
                </span>
                <span className="plan-priority-body">
                  <span className="plan-priority-q">
                    <span className="plan-rec-type">{c.typeLabel}</span>
                    {c.question}
                  </span>
                  <span className="plan-priority-reason">{c.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stat tiles */}
      <div className="plan-tiles">
        <StatTile icon={<CalendarIcon />} value={daysLeftLabel} label="Until target" />
        <StatTile
          icon={<CardsIcon />}
          value={plan.newPerDay > 0 ? plan.newPerDay : '—'}
          label="New / day"
        />
        <StatTile icon={<ClockIcon />} value={`${plan.avgMinutes}m`} label="Avg / day" />
        <StatTile icon={<CheckIcon />} value={fmtDate(plan.finishMs)} label="Ready by" />
      </div>

      {/* Milestones */}
      <div className="plan-section">
        <h4 className="plan-section-title">Milestones</h4>
        <ol className="plan-milestones">
          {plan.milestones.map((m) => (
            <li key={m.key} className={`plan-milestone ${m.done ? 'done' : ''}`}>
              <span className="plan-milestone-dot" aria-hidden="true">
                {m.done ? <CheckIcon /> : null}
              </span>
              <span className="plan-milestone-label">{m.label}</span>
              <span className="plan-milestone-date">{fmtDate(m.dateMs)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Upcoming schedule */}
      <div className="plan-section">
        <h4 className="plan-section-title">Upcoming schedule</h4>
        <ul className="plan-schedule">
          {upcoming.map((d) => (
            <li key={d.offset} className={`plan-row ${d.load === 0 ? 'rest' : ''}`}>
              <span className="plan-row-day">
                {d.offset === 0 ? 'Today' : d.offset === 1 ? 'Tomorrow' : fmtDate(d.dateMs)}
              </span>
              <span className="plan-row-bar" aria-hidden="true">
                {d.newCards > 0 && (
                  <span
                    className="plan-seg plan-seg-new"
                    style={{ width: `${(d.newCards / maxLoad) * 100}%` }}
                  />
                )}
                {d.reviews > 0 && (
                  <span
                    className="plan-seg plan-seg-review"
                    style={{ width: `${(d.reviews / maxLoad) * 100}%` }}
                  />
                )}
              </span>
              <span className="plan-row-meta">
                {d.load === 0 ? (
                  'Rest'
                ) : (
                  <>
                    {d.newCards > 0 && <span className="plan-row-new">{d.newCards} new</span>}
                    {d.reviews > 0 && <span className="plan-row-rev">{d.reviews} rev</span>}
                    <span className="plan-row-min">~{d.minutes}m</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="plan-legend" aria-hidden="true">
          <span className="plan-dot plan-dot-new" /> New cards
          <span className="plan-dot plan-dot-review" /> Reviews
        </p>
      </div>
    </div>
  )
}

// A personalized, adaptive study plan for one deck. Stores only the config on
// the deck (via onSave); the schedule is derived live from the deck's SRS
// state, so progress updates itself as the user studies. onSave(null) clears
// the plan.
export default function StudyPlanPanel({ deck, onSave, onReset, onStudy }) {
  const config = deck.plan || null
  const [editing, setEditing] = useState(!config)

  // Recompute from live card state on every mount / deck change.
  const plan = useMemo(() => buildPlan(deck, config, Date.now()), [deck, config])

  // Recommendation engine (deck-scoped): ranks this deck's cards by combining
  // due status + forgetting risk + weakness + difficulty + plan relevance. It
  // ENHANCES the SRS plan — it never reschedules. Surfaces the top few picks.
  const recommendation = useMemo(
    () => recommendNext({ sets: [deck], now: Date.now(), deckId: deck.id, limit: 4 }),
    [deck],
  )

  // Log an impression when a non-empty recommendation is shown (for the observed
  // acceptance rate), and record acceptance when the learner acts on it.
  useEffect(() => {
    if (recommendation?.cards?.length) {
      try {
        recordRecommendationImpression({ surface: 'plan', deckId: deck.id })
      } catch {
        /* best-effort */
      }
    }
  }, [deck.id, recommendation])

  const handleStudy = useCallback(() => {
    try {
      recordRecommendationAccepted({ recommendation, surface: 'plan', deckId: deck.id })
    } catch {
      /* best-effort */
    }
    onStudy?.()
  }, [recommendation, deck.id, onStudy])

  const handleSubmit = useCallback(
    (cfg) => {
      onSave(cfg)
      setEditing(false)
    },
    [onSave],
  )

  const handleReset = useCallback(() => {
    onReset()
    setEditing(true)
  }, [onReset])

  if (deck.cards.length === 0) {
    return (
      <div className="review-done plan-empty">
        <div className="review-done-art" aria-hidden="true">
          <RouteIcon />
        </div>
        <h3>No cards to plan yet</h3>
        <p>Generate a deck first and your study roadmap will build itself around it.</p>
      </div>
    )
  }

  if (editing || !config || !plan) {
    return (
      <PlanSetup
        deck={deck}
        initial={config}
        onSubmit={handleSubmit}
        onCancel={config ? () => setEditing(false) : null}
      />
    )
  }

  return (
    <PlanDashboard
      plan={plan}
      recommendation={recommendation}
      onEdit={() => setEditing(true)}
      onReset={handleReset}
      onStudy={handleStudy}
    />
  )
}
