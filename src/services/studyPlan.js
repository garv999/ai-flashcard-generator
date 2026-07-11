// Personalized study plan — turn a deck plus a goal (target date, daily study
// time, confidence) into an adaptive day-by-day roadmap.
//
// The plan is DERIVED, not stored. Only a lightweight config lives on the deck:
//   deck.plan = { targetDate, dailyMinutes, confidence, createdAt }
// The full schedule is recomputed from the deck's live SRS state every time it
// is shown, so completing reviews, missing days, or adding cards all reflect
// automatically the next time the Plan tab renders — there is no separate
// progress record to drift out of sync. It rides the existing deck persistence
// (localStorage in Demo mode, Firestore when signed in).
//
// Pure and dependency-free: identical behaviour in Demo mode and when signed in.

import { cardMaturity } from './analytics.js'

const DAY = 24 * 60 * 60 * 1000
const MATURE_DAYS = 21 // interval ≥ 21d ⇒ "mature" (matches analytics.js)

// Confidence presets tune both the review spacing and the time each action
// takes. Lower confidence ⇒ tighter spacing (more reps) and slower per card.
export const CONFIDENCE_LEVELS = [
  {
    key: 'low',
    label: 'New to this',
    hint: 'Seeing most of it for the first time',
    intervals: [1, 2, 4, 8, 15],
    secPerNew: 55,
    secPerReview: 28,
  },
  {
    key: 'medium',
    label: 'Somewhat familiar',
    hint: "I've studied this before",
    intervals: [1, 3, 7, 14, 28],
    secPerNew: 40,
    secPerReview: 20,
  },
  {
    key: 'high',
    label: 'Mostly review',
    hint: 'Just need to sharpen up',
    intervals: [1, 4, 10, 21],
    secPerNew: 28,
    secPerReview: 14,
  },
]

// Daily-time chip options (minutes).
export const DAILY_TIME_OPTIONS = [10, 15, 20, 30, 45, 60]

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const levelFor = (key) => CONFIDENCE_LEVELS.find((l) => l.key === key) || CONFIDENCE_LEVELS[1]

// ---------- date helpers ----------

// Local midnight for a timestamp.
export function startOfDay(ts) {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Whole days from day(a) to day(b); negative if b precedes a.
function dayspan(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY)
}

// Parse a 'YYYY-MM-DD' <input type="date"> value as LOCAL midnight (avoids the
// UTC-parsing off-by-one you get from `new Date('2026-07-20')`).
function parseDateInput(str) {
  if (!str) return NaN
  const [y, m, d] = String(str).split('-').map(Number)
  if (!y || !m || !d) return NaN
  return new Date(y, m - 1, d).getTime()
}

// 'YYYY-MM-DD' for an <input type="date"> value at local time.
export function toDateInput(ts) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Sensible default target: two weeks out.
export function defaultTargetDate(now = Date.now()) {
  return toDateInput(startOfDay(now) + 14 * DAY)
}

// Reserve a review-only buffer near the exam so nothing new is introduced at
// the last minute (≈15% of the horizon, at least 1 day when there's room). The
// remaining days are when new cards get introduced.
function introDaysFor(span) {
  const buffer = span > 2 ? clamp(Math.round(span * 0.15), 1, span - 1) : 0
  return Math.max(1, span - buffer)
}

// Validate a raw config from the setup form. Returns { ok, error }.
export function validatePlanConfig(config, now = Date.now()) {
  if (!config?.targetDate) return { ok: false, error: 'Pick a target date.' }
  const target = parseDateInput(config.targetDate)
  if (Number.isNaN(target)) return { ok: false, error: 'That date looks off.' }
  if (startOfDay(target) < startOfDay(now)) {
    return { ok: false, error: 'Pick a date in the future.' }
  }
  return { ok: true }
}

// Add a cohort of `count` freshly-introduced cards' future reviews to the event
// map, spaced by the confidence intervals, up to (but not past) the horizon.
function scheduleCohort(events, introOffset, count, intervals, totalDays) {
  let off = introOffset
  for (let stage = 0; stage < intervals.length; stage++) {
    off += intervals[stage]
    if (off >= totalDays) break
    events[off] = (events[off] || 0) + count
  }
}

// Build the full adaptive plan from a deck + config, evaluated at `now`.
// Returns null when there's no usable config or no cards. The returned object
// drives the entire Plan tab UI.
export function buildPlan(deck, config, now = Date.now()) {
  const cards = deck?.cards || []
  const total = cards.length
  if (!config?.targetDate || total === 0) return null

  const level = levelFor(config.confidence)
  const intervals = level.intervals
  const dailyMinutes = clamp(Number(config.dailyMinutes) || 20, 5, 240)
  const budgetSec = dailyMinutes * 60

  const today = startOfDay(now)
  const targetDay = startOfDay(parseDateInput(config.targetDate))
  const past = targetDay < today
  // Inclusive day count from today through the target (at least 1).
  const totalDays = Math.max(1, dayspan(today, targetDay) + 1)

  // --- Live progress snapshot from card SRS state -------------------------
  let remainingNew = 0
  let started = 0
  let mastered = 0
  let reviewedToday = 0
  const reviewEvents = {} // dayOffset -> reviews landing that day

  for (const card of cards) {
    if (cardMaturity(card) === 'mature') mastered++
    if (!card.srs) {
      remainingNew++
      continue
    }
    started++
    // Count cards already reviewed today — a deck-specific "done today" signal
    // derived purely from card state (no separate analytics needed).
    if (card.srs.last && dayspan(new Date(card.srs.last).getTime(), now) === 0) {
      reviewedToday++
    }
    // Seed this started card's future reviews from its REAL due date, then keep
    // expanding by the confidence intervals until the horizon runs out.
    let stage = clamp(card.srs.reps || 1, 1, intervals.length - 1)
    let off = Math.max(0, dayspan(now, new Date(card.srs.due).getTime()))
    while (off < totalDays) {
      reviewEvents[off] = (reviewEvents[off] || 0) + 1
      stage = Math.min(stage + 1, intervals.length - 1)
      off += intervals[stage]
    }
  }

  // --- Pace the new cards across the horizon ------------------------------
  const introDays = introDaysFor(totalDays)
  const newPerDay = remainingNew > 0 ? Math.ceil(remainingNew / introDays) : 0

  const days = []
  let leftNew = remainingNew
  let introducedOffset = remainingNew === 0 ? 0 : null

  for (let d = 0; d < totalDays; d++) {
    const reviews = reviewEvents[d] || 0
    let newCards = 0
    if (d < introDays && leftNew > 0) {
      newCards = Math.min(newPerDay, leftNew)
      // Reviews are mandatory; fit new cards into whatever time is left over.
      const roomSec = budgetSec - reviews * level.secPerReview
      const affordable = Math.floor(roomSec / level.secPerNew)
      newCards = clamp(newCards, 0, Math.max(0, affordable))
    }
    // Newly introduced cards generate their own future review load.
    if (newCards > 0) scheduleCohort(reviewEvents, d, newCards, intervals, totalDays)

    leftNew -= newCards
    if (leftNew === 0 && introducedOffset === null) introducedOffset = d

    const minutes = Math.round(
      (newCards * level.secPerNew + reviews * level.secPerReview) / 60,
    )
    days.push({
      offset: d,
      dateMs: today + d * DAY,
      newCards,
      reviews,
      minutes,
      load: newCards + reviews,
    })
  }

  // --- Derived load summary ----------------------------------------------
  const overCapacity = leftNew > 0 // couldn't introduce every card in time
  const worked = days.filter((x) => x.load > 0)
  const finishMs = (worked.length ? worked[worked.length - 1] : days[0]).dateMs
  const totalMinutes = days.reduce((s, x) => s + x.minutes, 0)
  const avgMinutes = Math.round(totalMinutes / totalDays)
  const peakMinutes = days.reduce((m, x) => Math.max(m, x.minutes), 0)

  // --- Progress + pacing status ------------------------------------------
  const masteryPct = Math.round((mastered / total) * 100)
  const startedPct = Math.round((started / total) * 100)
  const daysLeft = Math.max(0, dayspan(now, targetDay))

  // "On track?" compares cards actually started against a linear expectation
  // over the ORIGINAL window (createdAt → target), so it stays meaningful even
  // as the live horizon recompresses.
  const created = config.createdAt
    ? startOfDay(new Date(config.createdAt).getTime())
    : today
  const originalSpan = Math.max(1, dayspan(created, targetDay) + 1)
  const originalIntroDays = introDaysFor(originalSpan)
  const elapsed = clamp(dayspan(created, now), 0, originalIntroDays)
  const expectedStarted = Math.round(total * Math.min(1, elapsed / originalIntroDays))
  const slack = Math.max(1, newPerDay || Math.ceil(total / originalIntroDays))
  let status = 'on-track'
  if (started >= expectedStarted + slack) status = 'ahead'
  else if (started <= expectedStarted - slack) status = 'behind'
  if (masteryPct >= 100) status = 'ahead'

  // --- Milestones ---------------------------------------------------------
  const milestones = [{ key: 'start', label: 'Plan started', dateMs: created, done: true }]
  if (remainingNew === 0) {
    milestones.push({ key: 'intro', label: 'All cards introduced', dateMs: created, done: true })
  } else {
    milestones.push({
      key: 'intro',
      label: 'All cards introduced',
      dateMs: today + (introducedOffset ?? introDays - 1) * DAY,
      done: false,
    })
  }
  if (introDays < totalDays) {
    milestones.push({
      key: 'review',
      label: 'Final review phase',
      dateMs: today + introDays * DAY,
      done: false,
    })
  }
  milestones.push({ key: 'target', label: 'Target date', dateMs: targetDay, done: past })

  return {
    config: {
      targetDate: config.targetDate,
      dailyMinutes,
      confidence: level.key,
      createdAt: config.createdAt || new Date(now).toISOString(),
    },
    level,
    totalDays,
    targetMs: targetDay,
    createdMs: created,
    todayMs: today,
    past,
    days,
    today: days[0],
    milestones,
    // load
    newPerDay,
    avgMinutes,
    peakMinutes,
    totalMinutes,
    finishMs,
    overCapacity,
    introDays,
    // progress
    total,
    started,
    remainingNew,
    mastered,
    masteryPct,
    startedPct,
    reviewedToday,
    daysLeft,
    expectedStarted,
    status,
  }
}
