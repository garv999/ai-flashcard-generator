// Recommendation engine — TOPIC AGGREGATION.
//
// Rolls the scored card list up to the deck ("topic") level so the UI can show
// "Physics — High priority — 4 weak cards — 72% predicted forgetting risk". All
// figures are aggregated from the real per-card scores; nothing is invented.

const round2 = (n) => Math.round(n * 100) / 100

// Priority band from a deck's average recommendation score.
function band(avgScore) {
  if (avgScore >= 0.55) return 'high'
  if (avgScore >= 0.35) return 'medium'
  return 'low'
}

// Aggregate scored cards into per-topic insights, ranked most-important first.
// `scored` items carry { deckId, deckTopic, score, forgettingProbability, due,
// mlSource, factors } (from rank.js).
export function aggregateTopics(scored) {
  const byDeck = new Map()
  for (const c of scored) {
    const g =
      byDeck.get(c.deckId) ||
      { deckId: c.deckId, topic: c.deckTopic, n: 0, scoreSum: 0, riskSum: 0, weak: 0, due: 0, mlSource: c.mlSource, topScore: 0 }
    g.n++
    g.scoreSum += c.score
    g.riskSum += c.forgettingProbability
    if (c.forgettingProbability >= 0.6 || (c.factors?.weakness ?? 0) >= 0.6) g.weak++
    if (c.due) g.due++
    g.topScore = Math.max(g.topScore, c.score)
    byDeck.set(c.deckId, g)
  }

  return [...byDeck.values()]
    .map((g) => {
      const avgScore = round2(g.scoreSum / g.n)
      return {
        deckId: g.deckId,
        topic: g.topic,
        priority: band(avgScore),
        avgScore,
        avgForgetting: round2(g.riskSum / g.n),
        weakCards: g.weak,
        dueCards: g.due,
        cardCount: g.n,
        source: g.mlSource, // ML or SRS (batch-level provenance is the same)
      }
    })
    .sort((a, b) => b.avgScore - a.avgScore || b.topScore - a.topScore)
}
