// Forgetting-prediction ML service — public API.
//
// Pipeline stages live in sibling modules (features / dataset / logistic /
// model); this file orchestrates them into three things the app consumes:
//   • predictForgetting(sets)   — per-card forgetting probability + difficulty +
//                                 confidence + reasons (model when trained, SRS
//                                 fallback otherwise). Cold-start safe.
//   • prioritizeCards(deck)     — Study-Plan ordering that ENHANCES SRS: due
//                                 status + forgetting probability + intrinsic
//                                 difficulty. It never reschedules cards.
//   • learningIntelligence(sets)— the Analytics summary (coverage, high-risk
//                                 cards, high-risk topics, average difficulty).
//
// All client-side; no learning data leaves the device.

import { isDue } from '../srs.js'
import { predict as lrPredict, contributions } from './logistic.js'
import { extractFeatures, srsDifficulty, explain } from './features.js'
import { loadEvents, eventsForCard, recordReviewEvent } from './dataset.js'
import { getModel } from './model.js'

export { recordReviewEvent } from './dataset.js'
export { TRAINING_THRESHOLD, MODEL_VERSION } from './model.js'

const round2 = (n) => Math.round(n * 100) / 100
const clamp01 = (n) => Math.max(0, Math.min(1, n))
// A card counts toward "model coverage" once it has this many logged reviews.
const CARD_HISTORY_MIN = 2
const HIGH_RISK = 0.6 // forgettingProbability at/above which a card is high-risk

// Intrinsic difficulty (time-independent): how hard the card is regardless of
// when it's due. Distinct from forgettingProbability, which rises with overdue /
// time-since-review. Keeps the two presented values meaningful.
function intrinsicDifficulty(named) {
  return clamp01(0.5 * named.easeInv + 0.3 * named.immaturity + 0.2 * named.inaccuracy)
}

function modelConfidence(n, cardHistory) {
  return round2(clamp01(0.4 + 0.3 * Math.min(n / 200, 1) + 0.3 * Math.min(cardHistory / 8, 1)))
}

// Predict forgetting for every card across `sets`. Returns a cold-start-safe
// report: even with no model (or no history at all) every card gets a value from
// the SRS fallback, so callers never have to special-case emptiness.
export function predictForgetting({ sets = [], now = Date.now(), events = loadEvents() } = {}) {
  const { model, meta } = getModel(events)
  const usingModel = !!(model && meta.available)

  const cards = []
  for (const deck of sets) {
    ;(deck.cards || []).forEach((card, cardIndex) => {
      const prior = eventsForCard(events, deck.id, cardIndex)
      const { vector, named } = extractFeatures({ card, priorEvents: prior, now })
      const difficultyScore = round2(intrinsicDifficulty(named))

      let forgettingProbability
      let confidence
      let reasons
      let source
      if (usingModel) {
        forgettingProbability = round2(lrPredict(model, vector))
        reasons = explain(named, contributions(model, vector))
        confidence = modelConfidence(meta.n, prior.length)
        source = 'model'
      } else {
        forgettingProbability = round2(srsDifficulty(card, now))
        reasons = explain(named) // threshold rules over real features
        confidence = 0.3 // low, honest: this is the SRS heuristic, not a fit model
        source = 'srs'
      }
      // Guarantee a reason even for a clean card, so the UI is never blank.
      if (!reasons.length) reasons = [source === 'model' ? 'No strong risk signals' : 'Low SRS difficulty']

      cards.push({
        deckId: deck.id,
        deckTopic: deck.topic,
        cardIndex,
        question: card.question,
        forgettingProbability,
        difficultyScore,
        confidence,
        source,
        reasons,
        historyCount: prior.length,
        due: isDue(card, now),
      })
    })
  }

  return { available: usingModel, meta, cards, summary: summarize(cards, meta, usingModel) }
}

function summarize(cards, meta, usingModel) {
  const total = cards.length
  const coverage = cards.filter((c) => c.historyCount >= CARD_HISTORY_MIN).length
  const avgDifficulty = total ? round2(cards.reduce((s, c) => s + c.difficultyScore, 0) / total) : 0
  const avgForgetting = total ? round2(cards.reduce((s, c) => s + c.forgettingProbability, 0) / total) : 0
  const highRisk = cards
    .filter((c) => c.forgettingProbability >= HIGH_RISK)
    .sort((a, b) => b.forgettingProbability - a.forgettingProbability)

  // High-risk topics: decks ranked by their average forgetting probability.
  const byDeck = new Map()
  for (const c of cards) {
    const g = byDeck.get(c.deckId) || { deckId: c.deckId, topic: c.deckTopic, sum: 0, n: 0, high: 0 }
    g.sum += c.forgettingProbability
    g.n++
    if (c.forgettingProbability >= HIGH_RISK) g.high++
    byDeck.set(c.deckId, g)
  }
  const highRiskTopics = [...byDeck.values()]
    .map((g) => ({ deckId: g.deckId, topic: g.topic, avgRisk: round2(g.sum / g.n), highRiskCards: g.high }))
    .sort((a, b) => b.avgRisk - a.avgRisk)

  return {
    usingModel,
    total,
    coverage, // cards with enough personal history to be well-modeled
    coverageThreshold: CARD_HISTORY_MIN,
    avgDifficulty,
    avgForgetting,
    highRiskCount: highRisk.length,
    highRisk: highRisk.slice(0, 8),
    highRiskTopics: highRiskTopics.slice(0, 5),
    modelVersion: meta.version,
    trainedAt: meta.trainedAt || null,
    n: meta.n || 0,
    valAccuracy: meta.valAccuracy ?? null,
  }
}

// Study-Plan prioritization. Combines, without ever rescheduling a card:
//   1. Due status        (due cards come first)
//   2. Forgetting risk   (among those, likely-to-be-forgotten first)
//   3. Intrinsic SRS difficulty (mild tiebreak)
// Returns cards ordered most-important-first, each with the drivers exposed.
export function prioritizeCards({ deck, now = Date.now(), predictions = null } = {}) {
  const report = predictions || predictForgetting({ sets: [deck], now })
  const forDeck = report.cards.filter((c) => c.deckId === deck.id)
  return forDeck
    .map((c) => ({
      ...c,
      priority: round2(0.5 * (c.due ? 1 : 0) + 0.4 * c.forgettingProbability + 0.1 * c.difficultyScore),
    }))
    .sort((a, b) => b.priority - a.priority || b.forgettingProbability - a.forgettingProbability)
}

// Analytics-facing summary. Adds an explicit human message for the cold-start
// case so the UI can show "not enough history yet" without its own logic.
export function learningIntelligence({ sets = [], now = Date.now() } = {}) {
  const report = predictForgetting({ sets, now })
  const enoughHistory = report.available && report.summary.coverage > 0
  return {
    ...report.summary,
    available: report.available,
    enoughHistory,
    message: report.available
      ? null
      : 'Not enough study history for personalized predictions yet. Showing SRS-based difficulty until the model can train.',
  }
}
