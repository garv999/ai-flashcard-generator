// Learning Recommendation Engine — public API + RANKING.
//
// Answers "what should I study right now?" by combining the app's existing
// intelligence systems into one deterministic ranking. It does NOT re-implement
// SRS, analytics or the ML model — it consumes their outputs (via signals.js),
// normalizes and scores them (score.js), ranks, aggregates to topics
// (topics.js), and explains each pick (explain.js).
//
// Pipeline: collect signals → score → rank → classify/explain → aggregate.
// Deterministic and cold-start safe: with no ML history, no quiz, and no plan it
// still returns a sensible SRS-based ranking (source: 'SRS'). Never throws.

import { collectSignals } from './signals.js'
import { score } from './score.js'
import { classify, reasonFor, TYPE_LABEL } from './explain.js'
import { aggregateTopics } from './topics.js'

// Rank the eligible cards and return the full recommendation report.
//   { sets, stats, now, limit, deckId } -> {
//     available,          // true when the ML model produced the forgetting signal
//     source,             // 'ML' | 'SRS' (batch provenance)
//     cards,              // ranked recommendations (most valuable first)
//     topics,             // per-topic aggregation
//     summary,            // counts + headline pick
//   }
export function recommendNext({ sets = [], stats, now = Date.now(), limit = 8, deckId = null } = {}) {
  const collected = collectSignals({ sets, stats, now, deckId })

  const scored = collected.cards.map((s) => {
    const { score: value, factors, damper } = score(s, now)
    const type = classify(s, factors)
    return {
      deckId: s.deckId,
      deckTopic: s.deckTopic,
      cardIndex: s.cardIndex,
      question: s.question,
      score: value,
      type,
      typeLabel: TYPE_LABEL[type],
      reason: reasonFor(type, s),
      source: s.mlSource, // 'ML' | 'SRS' — never conflated
      forgettingProbability: s.forgettingProbability,
      difficultyScore: s.difficultyScore,
      due: s.due,
      overdueDays: s.overdueDays,
      factors,
      damper,
    }
  })

  // Deterministic ranking: score desc, then stable objective tiebreakers so the
  // order never depends on input array order or floating-point noise.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.forgettingProbability - a.forgettingProbability ||
      b.overdueDays - a.overdueDays ||
      a.deckId.localeCompare(b.deckId) ||
      a.cardIndex - b.cardIndex,
  )

  const topics = aggregateTopics(scored)
  const ranked = scored.slice(0, limit)

  return {
    available: collected.modelAvailable,
    source: collected.source,
    cards: ranked,
    topics,
    summary: {
      total: scored.length,
      due: scored.filter((c) => c.due).length,
      highRisk: scored.filter((c) => c.forgettingProbability >= 0.6).length,
      topPick: ranked[0] || null,
      source: collected.source,
    },
  }
}

// Compact, natural-language rendering of the ranked recommendations for the
// Adaptive AI Tutor. The tutor EXPLAINS these — it does not re-rank them.
export function recommendationContextText(rec, max = 5) {
  if (!rec?.cards?.length) return 'No study recommendations available yet.'
  const lines = rec.cards.slice(0, max).map((c, i) => `${i + 1}. [${c.typeLabel}] “${c.question}” — ${c.reason}`)
  const topicLine = rec.topics.length
    ? `Topics by priority: ${rec.topics
        .slice(0, 4)
        .map((t) => `${t.topic} (${t.priority}, ${Math.round(t.avgForgetting * 100)}% risk)`)
        .join('; ')}.`
    : ''
  return `RANKED RECOMMENDATIONS (from the recommendation engine — explain these, do NOT re-rank; forgetting signal source: ${rec.source}):\n${lines.join('\n')}\n${topicLine}`
}
