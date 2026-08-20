// Recommendation engine — NORMALIZATION + SCORING.
//
// Turns a raw signal bundle (signals.js) into a single normalized
// recommendation score in [0,1]. The score is a weighted sum of independent,
// each-normalized factors, multiplied by a recency damper. Weights are chosen
// deliberately (documented below), not arbitrarily, and any factor whose signal
// is UNAVAILABLE is dropped and its weight redistributed across the rest — so a
// brand-new user (no ML, no quiz, no plan) is still scored fairly on the signals
// that do exist.

const DAY = 24 * 60 * 60 * 1000
const clamp01 = (n) => Math.max(0, Math.min(1, n))
const round2 = (n) => Math.round(n * 100) / 100

// Factor weights + the rationale for each. They sum to 1 when every signal is
// present; missing factors are renormalized out (see score()).
export const WEIGHTS = {
  // The model's core question — how likely the card is to be forgotten right
  // now. The single most predictive "study this" signal, so it leads.
  forgettingRisk: 0.3,
  // SRS due/overdue. Spaced repetition is the backbone; a card past its due
  // date is actively losing retention, which is the most actionable trigger.
  urgency: 0.28,
  // Persistent struggle (low accuracy, repeated misses, weak topic). Rewards
  // cards the learner keeps getting wrong, not just ones that are merely due.
  weakness: 0.2,
  // Intrinsic hardness independent of timing. Secondary: a hard card that was
  // just reviewed isn't urgent, so difficulty alone shouldn't dominate.
  difficulty: 0.1,
  // Alignment with the learner's own Study Plan for today (and whether they're
  // behind). Only meaningful when a plan exists, hence a modest weight.
  planRelevance: 0.12,
}

// --- per-factor normalization (each → [0,1], or null when unavailable) -------

// Urgency: due now scores high and climbs with how overdue the card is; not-due
// cards get a small, decaying value based on how soon they come up. Always
// available (every card has a due state).
function urgency(s) {
  if (s.due) return clamp01(0.55 + (s.overdueDays / 14) * 0.45)
  return clamp01(0.25 - s.dueInDays * 0.02)
}

// Weakness: blend of the available evidence of struggle. Null when there is no
// evidence at all (no reviews, no quiz, deck not flagged weak) → redistributed.
function weakness(s) {
  const parts = []
  if (s.accuracy != null) parts.push(1 - s.accuracy)
  else if (s.quizBestPct != null) parts.push(1 - s.quizBestPct / 100)
  if (s.consecWrong > 0) parts.push(clamp01(s.consecWrong / 3))
  if (s.deckWeak) parts.push(1)
  if (!parts.length) return null
  return clamp01(parts.reduce((a, b) => a + b, 0) / parts.length)
}

// Plan relevance: null when the deck has no plan. Otherwise high when the card's
// deck has work scheduled today, higher still when the plan is behind.
function planRelevance(s) {
  if (!s.hasPlan) return null
  if (s.planTodayLoad > 0) return s.planStatus === 'behind' ? 1 : 0.7
  return 0.2
}

// Recency damper: down-weight a card reviewed very recently so it can't top the
// list right after being studied. Never reviewed (new) ⇒ no damping.
function recencyDamper(s, now) {
  if (!s.lastReviewMs) return 1
  const hrs = (now - s.lastReviewMs) / (DAY / 24)
  if (hrs < 6) return 0.4
  if (hrs < 24) return 0.65
  if (hrs < 48) return 0.85
  return 1
}

// Compute the normalized factors for a signal bundle (nulls = unavailable).
export function factors(s) {
  return {
    forgettingRisk: clamp01(s.forgettingProbability),
    urgency: urgency(s),
    weakness: weakness(s),
    difficulty: clamp01(s.difficultyScore),
    planRelevance: planRelevance(s),
  }
}

// Weighted score in [0,1]. Present factors' weights are renormalized to sum 1,
// then a recency damper is applied. Returns { score, factors, damper }.
export function score(s, now = Date.now()) {
  const f = factors(s)
  let wsum = 0
  let acc = 0
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (f[k] == null) continue // unavailable → redistribute (skip its weight)
    wsum += w
    acc += w * f[k]
  }
  const raw = wsum > 0 ? acc / wsum : 0
  const damper = recencyDamper(s, now)
  return { score: round2(clamp01(raw * damper)), factors: f, damper: round2(damper) }
}
