// Recommendation outcome tracking (observational).
//
// Records what happens AFTER a recommendation is acted on, so we can observe
// whether recommended cards get studied and how those reviews turn out. This is
// strictly observational: we use neutral language ("observed outcome") and make
// no causal claim that recommendations improve learning.
//
// Two lightweight logs, both device-local:
//   • impressions  — a recommendation surface was shown (for acceptance rate)
//   • acceptances  — the learner clicked "Study" on a recommendation; we snapshot
//                    the recommended cards (type, score, source, predicted risk)
// A later review of a recommended card is attributed to its acceptance (only a
// review AFTER the acceptance, within a window), recording the outcome + latency.

const IMPR_KEY = 'aifc.ml.recImpressions'
const ACC_KEY = 'aifc.ml.recAcceptances'
const MAX = 3000
const ATTRIB_WINDOW = 7 * 24 * 60 * 60 * 1000 // 7 days
export const REC_MIN = 15 // min studied recommended cards before showing rates

const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000)

function load(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}
function save(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(arr.length > MAX ? arr.slice(arr.length - MAX) : arr))
  } catch {
    /* quota */
  }
}
export const loadImpressions = () => load(IMPR_KEY)
export const loadAcceptances = () => load(ACC_KEY)
export function clearRecOutcomes() {
  try {
    localStorage.removeItem(IMPR_KEY)
    localStorage.removeItem(ACC_KEY)
  } catch {
    /* ignore */
  }
}

// A recommendation surface was shown (non-empty). `surface` is 'analytics' |
// 'plan'. Deduped per surface+deck within a short window so re-renders don't
// inflate the count.
export function recordRecommendationImpression({ surface, deckId = null, now = Date.now() } = {}) {
  const list = loadImpressions()
  const recent = list.some((i) => i.surface === surface && i.deckId === deckId && now - i.at < 60_000)
  if (recent) return null
  const evt = { id: `${surface}:${deckId}:${now}`, surface, deckId, at: now }
  save(IMPR_KEY, [...list, evt])
  return evt
}

// The learner accepted a recommendation batch (clicked Study). Snapshot the
// recommended cards so later reviews can be attributed to it.
export function recordRecommendationAccepted({ recommendation, surface, deckId = null, now = Date.now() } = {}) {
  const cards = (recommendation?.cards || []).map((c) => ({
    cardId: `${c.deckId}:${c.cardIndex}`,
    deckId: c.deckId,
    cardIndex: c.cardIndex,
    type: c.type,
    score: c.score,
    source: c.source, // 'ML' | 'SRS'
    pForget: c.forgettingProbability,
    studied: false,
    outcome: null,
    latencyMs: null,
  }))
  if (!cards.length) return null
  const evt = { id: `acc:${deckId}:${now}`, surface, deckId, at: now, cards }
  save(ACC_KEY, [...loadAcceptances(), evt])
  return evt
}

// Attribute a review to the most recent still-open acceptance that recommended
// this card. Only reviews AFTER the acceptance (and within the window) count, and
// each recommended card is matched at most once (its first subsequent review).
export function attributeRecommendationOutcome({ deckId, cardIndex, rating, now = Date.now() } = {}) {
  const cardId = `${deckId}:${cardIndex}`
  const list = loadAcceptances()
  let changed = false
  // Newest acceptance first, so a review attaches to the most recent suggestion.
  for (let a = list.length - 1; a >= 0 && !changed; a--) {
    const acc = list[a]
    if (now < acc.at || now - acc.at > ATTRIB_WINDOW) continue
    for (const c of acc.cards) {
      if (c.cardId === cardId && !c.studied) {
        c.studied = true
        c.outcome = rating === 'again' ? 1 : 0 // 1 = lapsed
        c.latencyMs = now - acc.at
        changed = true
        break
      }
    }
  }
  if (changed) save(ACC_KEY, list)
  return changed
}

// Observed recommendation metrics. All neutral/observational; gated by REC_MIN.
export function recommendationMetrics({ now = Date.now() } = {}) {
  const impressions = loadImpressions()
  const acceptances = loadAcceptances()
  const allCards = acceptances.flatMap((a) => a.cards)
  const studied = allCards.filter((c) => c.studied)

  const acceptanceRate =
    impressions.length > 0 ? round3(acceptances.length / impressions.length) : null

  // Not enough studied recommended cards to report outcome rates honestly.
  if (studied.length < REC_MIN) {
    return {
      available: false,
      impressions: impressions.length,
      acceptances: acceptances.length,
      recommendedCards: allCards.length,
      studiedCards: studied.length,
      min: REC_MIN,
      acceptanceRate,
      message: 'Not enough studied recommendations yet for observed outcome rates.',
    }
  }

  const lapses = studied.filter((c) => c.outcome === 1).length
  const successes = studied.length - lapses
  const highRisk = studied.filter((c) => c.pForget >= 0.6)
  const highRiskSuccess = highRisk.length
    ? round3(highRisk.filter((c) => c.outcome === 0).length / highRisk.length)
    : null

  // Observed outcome by recommendation type.
  const byType = {}
  for (const c of studied) {
    const g = byType[c.type] || { studied: 0, success: 0, lapse: 0 }
    g.studied++
    if (c.outcome === 1) g.lapse++
    else g.success++
    byType[c.type] = g
  }
  for (const k of Object.keys(byType)) {
    byType[k].successRate = round3(byType[k].success / byType[k].studied)
  }

  return {
    available: true,
    impressions: impressions.length,
    acceptances: acceptances.length,
    recommendedCards: allCards.length,
    studiedCards: studied.length,
    acceptanceRate,
    coverage: round3(studied.length / allCards.length), // share of recommended cards studied
    observedSuccessRate: round3(successes / studied.length),
    observedLapseRate: round3(lapses / studied.length),
    highRiskSuccessRate: highRiskSuccess,
    avgScore: round3(allCards.reduce((s, c) => s + (c.score || 0), 0) / allCards.length),
    byType,
  }
}
