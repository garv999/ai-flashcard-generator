// Exam blueprint — the deterministic ENGINE that decides WHAT to test.
//
// It does not re-rank or recompute anything: it reuses the recommendation engine
// (which already fuses weak areas, ML forgetting risk, SRS due status, quiz
// results and difficulty) to order the deck's cards, then applies exam-specific
// selection (weak-focus vs balanced coverage) and length clamping. The LLM is
// never involved in selection.
//
// Output is a list of card selections with the reason/source/risk that drove
// each pick, so the exam UI and grading can show ML/SRS provenance honestly.

import { recommendNext } from '../recommend/index.js'
import { canQuiz } from '../quiz.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))

// Forgetting-risk band from a probability (matches the Study Plan badges).
export function riskBand(p) {
  return p >= 0.6 ? 'high' : p >= 0.35 ? 'medium' : 'low'
}

// Even, deterministic stratified sample across an ordered index list, for broad
// coverage when the learner does NOT want a weak-focused exam.
function stratify(indices, want) {
  if (want >= indices.length) return indices.slice()
  const out = []
  const step = indices.length / want
  for (let k = 0; k < want; k++) out.push(indices[Math.floor(k * step)])
  return [...new Set(out)]
}

// Build the blueprint for a deck.
//   { deck, stats, now, length, focusWeak } -> {
//     source: 'ML' | 'SRS',   // forgetting-signal provenance
//     focusWeak, requested, actual, eligibleCount, canBuild,
//     items: [{ cardIndex, reason, type, source, riskProb, band, score }]
//   }
export function buildBlueprint({ deck, stats, now = Date.now(), length = 10, focusWeak = true } = {}) {
  const cards = deck?.cards || []
  // Eligible = has a question and an answer (needed to form an MCQ). buildQuiz
  // may still drop a card that can't get a distractor; that surfaces as
  // actual < requested downstream.
  const eligible = cards.map((_, i) => i).filter((i) => cards[i]?.question && cards[i]?.answer)
  const want = clamp(Number(length) || 10, 1, eligible.length)

  // Reuse the recommendation ranking (deck-scoped, deterministic).
  const rec = recommendNext({ sets: [deck], stats, now, deckId: deck?.id, limit: cards.length })
  const byIndex = new Map(rec.cards.map((c) => [c.cardIndex, c]))
  const eligibleSet = new Set(eligible)

  let selected
  if (focusWeak) {
    // Weakest / highest-risk first, in recommendation order.
    selected = rec.cards.filter((c) => eligibleSet.has(c.cardIndex)).map((c) => c.cardIndex).slice(0, want)
  } else {
    // Balanced coverage across the whole deck.
    selected = stratify(eligible, want)
  }
  // Guarantee we reach `want` eligible cards even if ranking missed any.
  for (const i of eligible) {
    if (selected.length >= want) break
    if (!selected.includes(i)) selected.push(i)
  }

  const items = selected.slice(0, want).map((i) => {
    const r = byIndex.get(i) || {}
    const riskProb = r.forgettingProbability ?? null
    return {
      cardIndex: i,
      reason: r.reason || null,
      type: r.type || null,
      source: r.source || rec.source, // 'ML' | 'SRS'
      riskProb,
      band: riskBand(riskProb ?? 0),
      score: r.score ?? null,
    }
  })

  return {
    source: rec.source,
    focusWeak: !!focusWeak,
    requested: Number(length) || 10,
    actual: items.length,
    eligibleCount: eligible.length,
    canBuild: canQuiz(deck) && items.length > 0,
    items,
  }
}
