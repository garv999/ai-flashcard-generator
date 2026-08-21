// Exam generation — the LLM only PHRASES; it never selects or ranks.
//
// Questions are built by the existing quiz engine (buildQuiz) over the exact
// card set the blueprint chose, enriched with the same AI-written distractors
// the Quiz uses. For PDF-backed decks each item is grounded via the existing RAG
// retrieval, attaching page/section citations (reusing buildSources) so the exam
// cites its source material and never fabricates a citation. Everything is
// best-effort: no key, no index, or a provider error degrades to the card-based
// question exactly as Quiz mode does.

import { buildQuiz } from '../quiz.js'
import { generateQuizDistractors, buildSources } from '../aiService.js'
import { retrieveForDeck } from '../retrieval.js'

// Generate exam questions for a deck from a blueprint.
//   { deck, blueprint, settings, user, signal } -> { questions, grounded, source }
// Each question carries `examMeta` = the blueprint pick (reason/source/risk/band)
// plus `sources` (citations) when the deck is document-backed.
export async function generateExam({ deck, blueprint, settings, user, signal } = {}) {
  const indices = (blueprint?.items || []).map((it) => it.cardIndex)
  const metaByIdx = new Map((blueprint?.items || []).map((it) => [it.cardIndex, it]))

  // Reuse the Quiz's AI distractors (best-effort; null in Demo / on failure).
  let aiDistractors = null
  try {
    aiDistractors = await generateQuizDistractors({ deck, settings, signal })
  } catch {
    aiDistractors = null
  }

  const questions = buildQuiz(deck, indices, aiDistractors) // reuse the MCQ engine

  const grounded = deck?.source === 'pdf' || (deck?.rag?.count || 0) > 0

  // Attach per-question citations for document-backed decks (parallel, bounded
  // by exam length). Falls back to no citation when retrieval is unavailable.
  const withMeta = await Promise.all(
    questions.map(async (q) => {
      let sources = null
      if (grounded) {
        try {
          const r = await retrieveForDeck({ deck, user, query: q.question, settings, topK: 3, signal })
          if (r) sources = buildSources(r, q.question, deck)
        } catch {
          sources = null
        }
      }
      return { ...q, examMeta: { ...(metaByIdx.get(q.cardIndex) || {}), sources } }
    }),
  )

  return { questions: withMeta, grounded, source: blueprint?.source || 'SRS' }
}
