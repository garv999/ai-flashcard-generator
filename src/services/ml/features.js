// Feature engineering for the forgetting-prediction model.
//
// Every feature is derived from data the app ALREADY records — a card's live SRS
// state (reps / ease / interval / due / last) plus the per-card review-event log
// (dataset.js), which captures each real review's outcome. Nothing is fabricated.
//
// The model's TARGET is: the probability that, at its next review, the card is
// FORGOTTEN — operationalized as the learner rating it "Again" (a lapse), the
// same signal SM-2 uses to reset the card. Label 1 = forgotten, 0 = recalled.
//
// A feature vector is computed from the state BEFORE a review (so the label never
// leaks into its own features). At prediction time the identical vector is
// computed from the card's current state, giving P(forgotten on next review).

const DAY = 24 * 60 * 60 * 1000
const DEFAULT_EASE = 2.5
const MIN_EASE = 1.3
const MATURE_DAYS = 21 // matches analytics.cardMaturity

const clamp01 = (n) => Math.max(0, Math.min(1, n))
const logNorm = (v, cap) => clamp01(Math.log1p(Math.max(0, v)) / Math.log1p(cap))

// Ordered feature list — the vector order is FIXED (the model, cache and
// explanations all index by it). `label` is the human reason shown when this
// feature pushes a card toward "likely forgotten".
export const FEATURES = [
  { key: 'reps', label: 'Few successful repetitions', doc: 'SRS successful reps, log-normalized (fewer ⇒ more fragile).' },
  { key: 'easeInv', label: 'Low recall strength', doc: 'Inverted SM-2 ease in 0..1 (higher ⇒ harder card).' },
  { key: 'intervalInv', label: 'Short SRS interval', doc: 'Inverted current interval (shorter ⇒ less consolidated).' },
  { key: 'daysSinceLast', label: 'Long time since last review', doc: 'Days since last review, log-normalized (Ebbinghaus decay).' },
  { key: 'overdue', label: 'Overdue for review', doc: 'daysSinceLast / interval, clamped (how far past schedule).' },
  { key: 'immaturity', label: 'Still maturing', doc: 'Inverted maturity: new/learning/young/mature ⇒ 1..0.' },
  { key: 'lapsed', label: 'Recently forgotten', doc: '1 if the card was reset by an "Again" (reps=0 with prior review).' },
  { key: 'priorReviews', label: 'Little review history', doc: 'Count of prior logged reviews, log-normalized.' },
  { key: 'inaccuracy', label: 'Low historical accuracy', doc: '1 − smoothed recall rate over prior reviews (Laplace).' },
  { key: 'consecWrong', label: 'Missed repeatedly in a row', doc: 'Trailing streak of "Again" ratings, normalized.' },
]

export const FEATURE_KEYS = FEATURES.map((f) => f.key)
export const TARGET_DOC =
  'P(card is forgotten at its next review), where "forgotten" = the learner rates it "Again" (a lapse).'

// Maturity as an ordinal 0..3 (mirrors analytics.cardMaturity thresholds).
function maturityOrdinal(card) {
  if (!card?.srs) return 0 // new
  const iv = card.srs.interval || 0
  if (iv < 1) return 1 // learning
  if (iv < MATURE_DAYS) return 2 // young
  return 3 // mature
}

// Trailing count of consecutive `label === 1` (forgotten) at the END of the
// prior-events list (most recent last).
function trailingStreak(priorEvents, label) {
  let n = 0
  for (let i = priorEvents.length - 1; i >= 0; i--) {
    if (priorEvents[i].label === label) n++
    else break
  }
  return n
}

// Build the raw feature vector for a card given its PRIOR review events.
//   card        — { srs?: { reps, ease, interval, due, last } }
//   priorEvents — this card's earlier events (each with a numeric `label`)
// Returns { vector, named } where vector is aligned to FEATURE_KEYS.
export function extractFeatures({ card, priorEvents = [], now = Date.now() } = {}) {
  const srs = card?.srs || null
  const reps = srs?.reps || 0
  const ease = typeof srs?.ease === 'number' ? srs.ease : DEFAULT_EASE
  const interval = srs?.interval || 0
  const lastMs = srs?.last ? new Date(srs.last).getTime() : null
  const daysSinceLast = lastMs != null ? Math.max(0, (now - lastMs) / DAY) : 0
  const lapsed = reps === 0 && !!lastMs

  const priorN = priorEvents.length
  const forgotten = priorEvents.reduce((s, e) => s + (e.label ? 1 : 0), 0)
  const recalled = priorN - forgotten
  // Laplace-smoothed recall rate so a thin history is neutral, not extreme.
  const recallRate = (recalled + 1) / (priorN + 2)

  const named = {
    reps: logNorm(reps, 12),
    easeInv: clamp01((DEFAULT_EASE - ease) / (DEFAULT_EASE - MIN_EASE)),
    intervalInv: 1 - logNorm(interval, 365),
    daysSinceLast: logNorm(daysSinceLast, 365),
    overdue: interval > 0 ? clamp01(daysSinceLast / interval / 3) : lastMs ? 1 : 0.5,
    immaturity: 1 - maturityOrdinal(card) / 3,
    lapsed: lapsed ? 1 : 0,
    priorReviews: logNorm(priorN, 30),
    inaccuracy: 1 - recallRate,
    consecWrong: clamp01(trailingStreak(priorEvents, 1) / 5),
  }
  const vector = FEATURE_KEYS.map((k) => named[k])
  return { vector, named }
}

// SRS-only difficulty estimate (0..1), the COLD-START fallback used when the ML
// model can't train yet. A transparent blend of the same signals SM-2 already
// tracks — low ease, immaturity, overdue, and lapses — so it degrades gracefully
// to "harder = more likely to be forgotten" without any learned weights.
export function srsDifficulty(card, now = Date.now()) {
  const { named } = extractFeatures({ card, priorEvents: [], now })
  const d =
    0.4 * named.easeInv +
    0.2 * named.immaturity +
    0.2 * named.overdue +
    0.15 * named.daysSinceLast +
    0.05 * (named.lapsed ? 1 : 0)
  return clamp01(d)
}

// Human-readable reasons for a prediction, derived from ACTUAL feature values.
// `contribs` (optional) are the model's signed log-odds contributions per
// feature; when present the reasons are ranked by them, otherwise a threshold
// rule over the raw features is used (the SRS-fallback path). Never invents text.
export function explain(named, contribs = null) {
  if (contribs) {
    return FEATURES.map((f, i) => ({ label: f.label, weight: contribs[i], value: named[f.key] }))
      .filter((r) => r.weight > 0.05 && r.value > 0.15)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((r) => r.label)
  }
  // SRS-fallback: simple thresholds over the strongest difficulty signals.
  const reasons = []
  if (named.daysSinceLast >= 0.5) reasons.push('Long time since last review')
  if (named.inaccuracy >= 0.5 && named.priorReviews > 0) reasons.push('Low historical accuracy')
  if (named.reps <= 0.2) reasons.push('Few successful repetitions')
  if (named.intervalInv >= 0.6) reasons.push('Short SRS interval')
  if (named.lapsed) reasons.push('Recently forgotten')
  if (!reasons.length && named.immaturity >= 0.6) reasons.push('Still maturing')
  return reasons.slice(0, 3)
}
