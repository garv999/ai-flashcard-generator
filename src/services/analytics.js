// Study analytics — a small, dependency-free stats layer.
//
// Temporal data (reviews per day, streaks, rating mix) is kept as compact
// day-buckets so it stays tiny and bounded:
//   stats = { days: { 'YYYY-MM-DD': { r, a, h, g, e } } }
//     r = total reviews that day; a/h/g/e = counts per rating.
//
// Card-derived data (maturity, mastery, ease) is computed on the fly from the
// decks already in memory — no duplication, always in sync.

const STATS_KEY = 'aifc.stats'
const MATURE_DAYS = 21 // Anki convention: interval ≥ 21d ⇒ "mature"
const RATING_FIELD = { again: 'a', hard: 'h', good: 'g', easy: 'e' }

// ---------- day helpers ----------
export function dayKey(ts = Date.now()) {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function keyToUTC(k) {
  const [y, m, d] = k.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
function dayDiff(a, b) {
  return Math.round((keyToUTC(b) - keyToUTC(a)) / 86400000)
}

// ---------- shape helpers ----------
export function emptyStats() {
  return { days: {} }
}
function emptyBucket() {
  return { r: 0, a: 0, h: 0, g: 0, e: 0 }
}
export function hasData(stats) {
  return !!stats && !!stats.days && Object.keys(stats.days).length > 0
}

// Immutably record one review into today's bucket.
export function recordReview(stats, rating, now = Date.now()) {
  const base = stats && stats.days ? stats : emptyStats()
  const key = dayKey(now)
  const days = { ...base.days }
  const prev = days[key] || emptyBucket()
  const field = RATING_FIELD[rating] || 'g'
  days[key] = { ...prev, r: (prev.r || 0) + 1, [field]: (prev[field] || 0) + 1 }
  return { ...base, days }
}

// Merge two stat objects (used when a Demo-mode log is folded into the cloud).
export function mergeStats(a, b) {
  const days = { ...(a?.days || {}) }
  for (const [k, v] of Object.entries(b?.days || {})) {
    const cur = days[k] || emptyBucket()
    days[k] = {
      r: (cur.r || 0) + (v.r || 0),
      a: (cur.a || 0) + (v.a || 0),
      h: (cur.h || 0) + (v.h || 0),
      g: (cur.g || 0) + (v.g || 0),
      e: (cur.e || 0) + (v.e || 0),
    }
  }
  return { days }
}

// ---------- localStorage (Demo mode) ----------
export function loadLocalStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && parsed.days ? parsed : emptyStats()
  } catch {
    return emptyStats()
  }
}
export function saveLocalStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    /* ignore quota errors */
  }
}
export function clearLocalStats() {
  localStorage.removeItem(STATS_KEY)
}

// ---------- temporal derivations ----------
export function totals(stats) {
  const t = { reviews: 0, again: 0, hard: 0, good: 0, easy: 0, daysStudied: 0 }
  for (const v of Object.values(stats?.days || {})) {
    if ((v.r || 0) <= 0) continue
    t.reviews += v.r || 0
    t.again += v.a || 0
    t.hard += v.h || 0
    t.good += v.g || 0
    t.easy += v.e || 0
    t.daysStudied += 1
  }
  return t
}

export function reviewsOn(stats, key) {
  return stats?.days?.[key]?.r || 0
}

// Consecutive days with reviews, ending today (a one-day grace period so the
// streak doesn't read 0 first thing before today's session).
export function currentStreak(stats, now = Date.now()) {
  const days = stats?.days || {}
  const has = (d) => (days[dayKey(d.getTime())]?.r || 0) > 0
  const cursor = new Date(now)
  if (!has(cursor)) {
    cursor.setDate(cursor.getDate() - 1)
    if (!has(cursor)) return 0
  }
  let streak = 0
  while (has(cursor)) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function longestStreak(stats) {
  const keys = Object.keys(stats?.days || {})
    .filter((k) => (stats.days[k].r || 0) > 0)
    .sort()
  let best = 0
  let run = 0
  let prev = null
  for (const k of keys) {
    run = prev && dayDiff(prev, k) === 1 ? run + 1 : 1
    if (run > best) best = run
    prev = k
  }
  return best
}

// Last `n` days (inclusive of today) as an ordered series for charts.
export function activitySeries(stats, n, now = Date.now()) {
  const out = []
  const base = new Date(now)
  base.setHours(0, 0, 0, 0)
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    const key = dayKey(d.getTime())
    out.push({ key, date: d, ...emptyBucket(), ...(stats?.days?.[key] || {}) })
  }
  return out
}

// Retention = share of reviews that were NOT "Again".
export function retention(stats) {
  const t = totals(stats)
  if (!t.reviews) return null
  return (t.hard + t.good + t.easy) / t.reviews
}

// ---------- card-derived derivations ----------
export function cardMaturity(card) {
  if (!card?.srs) return 'new'
  const iv = card.srs.interval || 0
  if (iv < 1) return 'learning'
  if (iv < MATURE_DAYS) return 'young'
  return 'mature'
}

export function maturityCounts(sets) {
  const c = { new: 0, learning: 0, young: 0, mature: 0, total: 0 }
  for (const s of sets || []) {
    for (const card of s.cards || []) {
      c[cardMaturity(card)] += 1
      c.total += 1
    }
  }
  return c
}

export function avgEase(sets) {
  let sum = 0
  let n = 0
  for (const s of sets || []) {
    for (const card of s.cards || []) {
      if (card?.srs?.ease) {
        sum += card.srs.ease
        n += 1
      }
    }
  }
  return n ? sum / n : 0
}

// Per-deck maturity breakdown + mastery percentage (mature / total).
export function deckProgress(set) {
  const c = { new: 0, learning: 0, young: 0, mature: 0, total: 0 }
  for (const card of set.cards || []) {
    c[cardMaturity(card)] += 1
    c.total += 1
  }
  const masteryPct = c.total ? Math.round((c.mature / c.total) * 100) : 0
  const started = c.total - c.new
  return { ...c, started, masteryPct }
}

// Aggregate quiz history across decks. Each deck may carry a quiz record
// (written by the quiz engine):
//   deck.quiz = { best: Attempt, last: Attempt }
//   Attempt   = { pct, correct, total, at }   (pct 0..100, at = ISO string)
// Only decks that have actually been quizzed contribute; the rest are ignored
// so an untouched library reports a clean empty state.
export function quizStats(sets) {
  const decks = []
  for (const s of sets || []) {
    const q = s?.quiz
    if (!q || !q.best || typeof q.best.pct !== 'number') continue
    decks.push({
      id: s.id,
      topic: s.topic,
      best: q.best,
      last: q.last || q.best,
    })
  }
  decks.sort((a, b) => (b.best.pct || 0) - (a.best.pct || 0))

  const count = decks.length
  const avgBest = count
    ? Math.round(decks.reduce((sum, d) => sum + (d.best.pct || 0), 0) / count)
    : 0
  const topBest = count ? Math.max(...decks.map((d) => d.best.pct || 0)) : 0
  return { decks, count, avgBest, topBest }
}
