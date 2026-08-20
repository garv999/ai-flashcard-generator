// Recommendation engine — SIGNAL COLLECTION.
//
// Gathers, per eligible card, the real signals the ranking needs — WITHOUT
// recomputing any of them. Each signal is read from the system that already
// owns it:
//   • forgetting probability / difficulty / source → ml/index.predictForgetting
//     (the personalized model when trained, SRS estimate otherwise)
//   • due status / overdue / recency               → srs.js + card.srs
//   • maturity                                      → analytics.cardMaturity
//   • historical accuracy / consecutive misses      → ml event log (dataset.js)
//   • quiz performance                              → deck.quiz
//   • weak topic                                    → coach.buildCoachBriefing
//   • study-plan progress                           → studyPlan.buildPlan
//
// Output is a flat list of raw per-card signal bundles plus a little context;
// normalization and scoring happen downstream (score.js). Never throws.

import { isDue } from '../srs.js'
import { cardMaturity } from '../analytics.js'
import { buildCoachBriefing } from '../coach.js'
import { buildPlan } from '../studyPlan.js'
import { predictForgetting } from '../ml/index.js'
import { loadEvents, eventsForCard } from '../ml/dataset.js'

const DAY = 24 * 60 * 60 * 1000

// Trailing run of consecutive "forgotten" (label 1) reviews for a card.
function consecutiveWrong(events) {
  let n = 0
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].label === 1) n++
    else break
  }
  return n
}

// Collect raw signals for every card across `sets` (optionally one deck).
export function collectSignals({ sets = [], stats, now = Date.now(), deckId = null } = {}) {
  const scope = deckId ? sets.filter((d) => d.id === deckId) : sets
  const events = loadEvents()

  // Forgetting probability + difficulty + ML/SRS provenance, straight from the
  // ML service (which already handles the model-vs-SRS fallback).
  const pred = predictForgetting({ sets: scope, now, events })
  const predByKey = new Map(pred.cards.map((c) => [`${c.deckId}:${c.cardIndex}`, c]))

  // Canonical "weak topic" set — reuse the coach's existing definition of a weak
  // area (low quiz score, or heavily-studied-yet-low-mastery) rather than
  // inventing our own.
  const briefing = buildCoachBriefing({ sets, stats, now })
  const weakDeckIds = new Set(briefing.weakAreas.map((w) => w.id))

  const cards = []
  const plansByDeck = new Map()

  for (const deck of scope) {
    // Study-plan progress (only when the deck has a plan configured).
    const plan = deck.plan ? buildPlan(deck, deck.plan, now) : null
    plansByDeck.set(deck.id, plan)
    const planTodayLoad = plan ? (plan.today?.newCards || 0) + (plan.today?.reviews || 0) : 0

    ;(deck.cards || []).forEach((card, cardIndex) => {
      const key = `${deck.id}:${cardIndex}`
      const p = predByKey.get(key) || {}
      const srs = card.srs || null
      const dueMs = srs?.due ? new Date(srs.due).getTime() : now
      const lastMs = srs?.last ? new Date(srs.last).getTime() : null
      const due = isDue(card, now)
      const overdueDays = due && srs ? Math.max(0, (now - dueMs) / DAY) : 0
      const dueInDays = (dueMs - now) / DAY

      const evts = eventsForCard(events, deck.id, cardIndex)
      const wrong = evts.reduce((s, e) => s + (e.label ? 1 : 0), 0)
      const accuracy = evts.length ? (evts.length - wrong) / evts.length : null

      cards.push({
        deckId: deck.id,
        deckTopic: deck.topic,
        cardIndex,
        question: card.question,
        // ML/SRS forgetting signal
        forgettingProbability: p.forgettingProbability ?? 0,
        difficultyScore: p.difficultyScore ?? 0,
        confidence: p.confidence ?? 0,
        mlSource: p.source === 'model' ? 'ML' : 'SRS',
        mlReasons: p.reasons || [],
        // SRS urgency / recency
        due,
        overdueDays,
        dueInDays,
        maturity: cardMaturity(card),
        lastReviewMs: lastMs,
        isNew: !srs,
        // weakness signals
        accuracy, // null when no review history
        consecWrong: consecutiveWrong(evts),
        historyCount: evts.length,
        quizBestPct: deck.quiz?.best?.pct ?? null,
        deckWeak: weakDeckIds.has(deck.id),
        // plan relevance
        hasPlan: !!plan,
        planStatus: plan?.status || null,
        planTodayLoad,
      })
    })
  }

  return {
    now,
    // Overall provenance for the batch: ML only when the model actually trained.
    source: pred.available ? 'ML' : 'SRS',
    modelAvailable: pred.available,
    cards,
    plansByDeck,
    weakDeckIds,
  }
}
