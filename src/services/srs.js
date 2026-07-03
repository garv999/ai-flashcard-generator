// Spaced-repetition scheduling (SM-2 / Anki-style).
//
// Each card may carry an `srs` object describing its schedule:
//   { reps, ease, interval, due, last }
//     reps     — number of consecutive successful reviews
//     ease     — ease factor (>= 1.3), grows/shrinks with performance
//     interval — current interval in days (0 == learning / same session)
//     due      — ISO timestamp the card next becomes due
//     last     — ISO timestamp of the last review
//
// A card without `srs` is treated as brand-new (always due). All values are
// plain numbers / ISO strings so they persist cleanly to Firestore & localStorage.

const DAY = 24 * 60 * 60 * 1000
const AGAIN_DELAY = 10 * 60 * 1000 // 10 minutes for a lapsed card
const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3

// Rating buttons exposed to the UI (order matters — 1..4).
export const RATINGS = [
  { key: 'again', label: 'Again', hint: 'Forgot', num: 1 },
  { key: 'hard', label: 'Hard', hint: 'Tough', num: 2 },
  { key: 'good', label: 'Good', hint: 'Recalled', num: 3 },
  { key: 'easy', label: 'Easy', hint: 'Easy', num: 4 },
]

const round2 = (n) => Math.round(n * 100) / 100
const clampEase = (e) => Math.max(MIN_EASE, round2(e))

function baseSrs(card) {
  const s = card?.srs
  if (s && typeof s.ease === 'number') {
    return { reps: s.reps || 0, ease: s.ease, interval: s.interval || 0 }
  }
  return { reps: 0, ease: DEFAULT_EASE, interval: 0 }
}

// Compute the next schedule for a card given a rating and the current time (ms).
// Returns a new `srs` object; does not mutate the card.
export function schedule(card, rating, now = Date.now()) {
  let { reps, ease, interval } = baseSrs(card)
  let dueMs

  switch (rating) {
    case 'again':
      reps = 0
      ease = clampEase(ease - 0.2)
      interval = 0
      dueMs = now + AGAIN_DELAY
      break
    case 'hard':
      ease = clampEase(ease - 0.15)
      interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2))
      reps += 1
      dueMs = now + interval * DAY
      break
    case 'easy':
      ease = clampEase(ease + 0.15)
      if (reps === 0) interval = 4
      else if (reps === 1) interval = 8
      else interval = Math.max(1, Math.round(interval * ease * 1.3))
      reps += 1
      dueMs = now + interval * DAY
      break
    case 'good':
    default:
      if (reps === 0) interval = 1
      else if (reps === 1) interval = 6
      else interval = Math.max(1, Math.round(interval * ease))
      reps += 1
      dueMs = now + interval * DAY
      break
  }

  return {
    reps,
    ease,
    interval,
    due: new Date(dueMs).toISOString(),
    last: new Date(now).toISOString(),
  }
}

// A card is due if it has never been scheduled, or its due time has passed.
export function isDue(card, now = Date.now()) {
  const due = card?.srs?.due
  if (!due) return true
  return new Date(due).getTime() <= now
}

export function isNew(card) {
  return !card?.srs
}

// Indices of the cards in a deck that are currently due (new cards included).
export function getDueIndices(set, now = Date.now()) {
  if (!set?.cards) return []
  const indices = []
  set.cards.forEach((card, i) => {
    if (isDue(card, now)) indices.push(i)
  })
  return indices
}

export function deckDueCount(set, now = Date.now()) {
  return getDueIndices(set, now).length
}

// Earliest future due time across a deck (ms), or null if none scheduled ahead.
export function nextDueAt(set, now = Date.now()) {
  if (!set?.cards) return null
  let min = null
  for (const card of set.cards) {
    const due = card?.srs?.due
    if (!due) continue
    const t = new Date(due).getTime()
    if (t > now && (min === null || t < min)) min = t
  }
  return min
}

// Human label for an interval in days (used on rating buttons).
export function formatInterval(days) {
  if (days <= 0) return '10m'
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${Math.max(1, Math.round(days / 30))}mo`
  return `${(days / 365).toFixed(1)}y`
}

// Preview label for what a given rating would schedule next.
export function previewInterval(card, rating, now = Date.now()) {
  if (rating === 'again') return '10m'
  const next = schedule(card, rating, now)
  return formatInterval(next.interval)
}

// Relative "due in …" label for the caught-up screen.
export function formatDueIn(ms, now = Date.now()) {
  const diff = ms - now
  if (diff <= 0) return 'now'
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}
