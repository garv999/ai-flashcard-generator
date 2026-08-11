// Tutor learning-state collection.
//
// The adaptive tutor decides HOW to respond from the learner's real study
// state. This module does NOT compute anything new — it composes the two
// existing analytical brains and the SRS/analytics primitives:
//
//   • buildCoachBriefing (coach.js)      — deck-level: due, workload, streak,
//                                           recall, weak areas, recommendations
//   • buildIntelligence  (intelligence.js) — concept-level: weak concepts,
//                                           forgotten (lapsed) cards, revision
//                                           priorities, mastered cards
//   • cardMaturity / srs fields          — per-card maturity for the focused
//                                           concept the learner is asking about
//
// Everything is derived live from `sets` + `stats` + `chats`, so there is a
// single source of truth for learning state across the whole app.

import { buildCoachBriefing } from '../coach.js'
import { buildIntelligence } from '../intelligence.js'
import { cardMaturity } from '../analytics.js'

// Collect the full tutor-facing learning state. `deck` is the active deck (may
// be null); `sets` is every deck; `stats` the analytics object; `chats` the AI
// conversation map (optional — only feeds the "what you keep asking" signal).
export function collectLearningState({ deck, sets = [], stats, chats = {}, now = Date.now() } = {}) {
  const briefing = buildCoachBriefing({ sets, stats, activeId: deck?.id || null, now })
  const intel = buildIntelligence({ sets, stats, chats, now })

  const deckId = deck?.id || null
  const inDeck = (c) => c.deckId === deckId

  // Per-deck slices of the concept-level intelligence, so the tutor can talk
  // about THIS deck's weak / forgotten / mastered concepts specifically.
  const deckInsight = briefing.insights.find((d) => d.id === deckId) || null
  const weakConcepts = intel.weakConcepts.filter(inDeck)
  const forgotten = intel.forgottenTopics.filter(inDeck) // recently missed / lapsed
  const mastered = (deck?.cards || [])
    .map((c, i) => ({ i, c }))
    .filter(({ c }) => cardMaturity(c) === 'mature')
    .map(({ i, c }) => ({ cardIndex: i, question: c.question }))

  return {
    now,
    hasHistory: intel.hasData, // any card has recall history yet
    briefing, // full coach briefing (drives RECOMMEND grounding)
    intelligence: intel, // full concept-level report (weak / forgotten / gaps)
    deck: {
      id: deckId,
      topic: deck?.topic || null,
      source: deck?.source || 'topic',
      dueCount: deckInsight?.due ?? 0,
      masteryPct: deckInsight?.masteryPct ?? 0,
      started: deckInsight?.started ?? 0,
      total: deckInsight?.total ?? (deck?.cards?.length || 0),
      quizBest: deckInsight?.quizBest ?? null,
      weakConcepts,
      forgotten,
      mastered,
    },
    global: {
      due: briefing.totals.due,
      workloadMin: briefing.workloadMin,
      streak: briefing.streak,
      recall: briefing.recall,
      weakAreas: briefing.weakAreas,
      recommendations: briefing.recommendations,
      revisionPriorities: intel.revisionPriorities,
    },
  }
}

// Classify the learner's grasp of the specific concept they're asking about.
// `cards` are the semantic-search matches for the question (best first). We look
// the top match up in the concept-level intelligence (weak / forgotten sets) and
// fall back to its SRS maturity. Returns the level plus the concept label so the
// tutor can reference it.
//
//   'missed'  — recently forgotten / lapsed → misconception + re-practice
//   'weak'    — fragile (low ease, still learning) → explain simply
//   'strong'  — mature → be concise, go deeper
//   'partial' — studied but middling → concise + connect + check
//   'new'     — no recall history → explain from scratch
//   'unknown' — no matching card (e.g. pure document question)
export function focusLevel(cards, state, deck) {
  const top = cards && cards.length ? cards[0] : null
  if (!top) return { level: 'unknown', concept: null, card: null }

  const key = (x) => `${x.deckId}:${x.cardIndex}`
  const topKey = `${top.deckId ?? deck?.id}:${top.cardIndex}`
  const forgotten = new Set((state?.intelligence?.forgottenTopics || []).map(key))
  const weak = new Set((state?.intelligence?.weakConcepts || []).map(key))

  const concept = top.question || null
  if (forgotten.has(topKey)) return { level: 'missed', concept, card: top }
  if (weak.has(topKey)) return { level: 'weak', concept, card: top }

  // No fragility flag — read the card's own SRS maturity from the deck.
  const card = (deck?.cards || [])[top.cardIndex]
  if (!card?.srs) return { level: 'new', concept, card: top }
  const maturity = cardMaturity(card)
  if (maturity === 'mature') return { level: 'strong', concept, card: top }
  if (maturity === 'learning') return { level: 'weak', concept, card: top }
  return { level: 'partial', concept, card: top }
}
