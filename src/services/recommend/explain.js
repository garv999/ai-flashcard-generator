// Recommendation engine — EXPLANATION GENERATION.
//
// Turns a card's signals + normalized factors into (a) a recommendation TYPE and
// (b) a human reason string. Both are derived purely from the real numbers — no
// LLM, no invented wording. The type is the single most salient reason the card
// surfaced; the reason spells it out with the actual figures.

const pct = (n) => `${Math.round(n * 100)}%`

// Recommendation types the engine can assign (spec §RECOMMENDATION TYPES).
export const TYPES = {
  PLAN_PRIORITY: 'plan-priority',
  HIGH_RISK: 'high-risk',
  FREQUENTLY_MISSED: 'frequently-missed',
  REVIEW_NOW: 'review-now',
  DUE: 'due-for-review',
  WEAK_TOPIC: 'weak-topic',
  QUICK_PRACTICE: 'quick-practice',
}

// Short label for a type (for a badge).
export const TYPE_LABEL = {
  'plan-priority': 'Study-plan priority',
  'high-risk': 'High forgetting risk',
  'frequently-missed': 'Frequently missed',
  'review-now': 'Review now',
  'due-for-review': 'Due for review',
  'weak-topic': 'Weak topic',
  'quick-practice': 'Quick practice',
}

// Classify a card by its most salient signal. Order matters: the first matching
// rule wins, most-specific first.
export function classify(s, f) {
  const highRisk = s.forgettingProbability >= 0.6
  if (s.hasPlan && s.planTodayLoad > 0 && (s.due || highRisk || s.deckWeak)) return TYPES.PLAN_PRIORITY
  if (s.consecWrong >= 2 || (s.accuracy != null && s.accuracy <= 0.5 && s.historyCount >= 2)) return TYPES.FREQUENTLY_MISSED
  if (highRisk) return TYPES.HIGH_RISK
  if (s.due && s.overdueDays >= 1) return TYPES.REVIEW_NOW
  if (s.due) return TYPES.DUE
  if (s.deckWeak) return TYPES.WEAK_TOPIC
  return TYPES.QUICK_PRACTICE
}

// Build the reason string for a card + type, from actual signal values. The ML/
// SRS source is carried separately (never implied to be one when it's the other).
export function reasonFor(type, s) {
  const risk = `${pct(s.forgettingProbability)} forgetting risk`
  switch (type) {
    case TYPES.PLAN_PRIORITY:
      return `Part of today's study plan${s.planStatus === 'behind' ? " and you're behind" : ''}${
        s.due ? ' · due now' : ''
      } · ${risk}.`
    case TYPES.FREQUENTLY_MISSED:
      return s.consecWrong >= 2
        ? `Missed ${s.consecWrong} times in a row recently · ${risk}.`
        : `Low recent accuracy (${pct(s.accuracy ?? 0)}) · ${risk}.`
    case TYPES.HIGH_RISK:
      return `High predicted forgetting probability (${pct(s.forgettingProbability)})${
        s.due ? ' and due now' : ''
      }.`
    case TYPES.REVIEW_NOW:
      return `Overdue by ${Math.round(s.overdueDays)} day${Math.round(s.overdueDays) === 1 ? '' : 's'} · ${risk}.`
    case TYPES.DUE:
      return s.isNew ? `New card, ready to learn · ${risk}.` : `Due for review · ${risk}.`
    case TYPES.WEAK_TOPIC:
      return `In a weak topic (“${s.deckTopic}”) · ${risk}.`
    case TYPES.QUICK_PRACTICE:
    default:
      return `Not due yet — a quick refresher (${risk}).`
  }
}
