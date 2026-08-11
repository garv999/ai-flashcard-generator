// Tutor context assembly.
//
// Gathers the three knowledge sources the tutor answers from, reusing the
// existing systems verbatim:
//   1. Document passages — retrieveForDeck (retrieval.js, the RAG pipeline)
//   2. Relevant flashcards — searchCards (semanticSearch.js, vector search)
//   3. (learner state is collected separately, in learningState.js)
//
// It also computes the GROUNDING status: whether the answer is document-grounded
// and — for PDF-backed decks where the learner expects a grounded answer —
// whether retrieval actually found enough material. When it did not, the tutor
// must say so rather than silently answering from unrelated knowledge.

import { retrieveForDeck } from '../retrieval.js'
import { searchCards } from '../semanticSearch.js'

// Intents whose answer is expected to come from the uploaded document when the
// deck is PDF-backed. For these, thin retrieval means "material insufficient".
const DOC_GROUNDED_INTENTS = new Set(['explain', 'summarize', 'example', 'compare', 'practice', 'test'])

// Minimum top passage score to consider the document a real match (mirrors the
// spirit of semanticSearch's noise floor; retrieval vectors are L2-normalized so
// score is cosine similarity). Below this we treat a passage hit as too weak.
const PASSAGE_FLOOR = 0.12

// Gather document passages and relevant flashcards for a question. Never throws:
// each source degrades to empty/null independently so a failure in one (no
// index, no embeddings, provider down) never breaks the tutor.
export async function gatherContext({
  deck,
  sets = [],
  user,
  settings,
  query,
  intent,
  topKDoc = 5,
  topKCards = 6,
  signal,
} = {}) {
  // 1. Document RAG (best-effort; null for topic decks or when unavailable).
  let retrieved = null
  try {
    retrieved = await retrieveForDeck({ deck, user, query, settings, topK: topKDoc, signal })
  } catch {
    retrieved = null
  }

  // 2. Semantic flashcards. Scope to the active deck for content questions; for
  //    cross-deck guidance (recommend/review) search the whole library.
  const crossDeck = intent === 'recommend' || intent === 'review'
  const scope = crossDeck ? sets : deck ? [deck] : sets
  let cards = []
  try {
    cards = await searchCards(query, scope, settings, { signal, topK: topKCards })
  } catch {
    cards = []
  }

  return { retrieved, cards }
}

// Decide the grounding status for this answer.
//   grounded     — answer is backed by document passages/overview
//   expectsDoc   — this deck+intent should be answered from the document
//   insufficient — expectsDoc but retrieval found no real passage match
//   weak         — only a document overview (no targeted passage) is available
export function groundingStatus({ deck, retrieved, intent }) {
  const isPdfDeck = deck?.source === 'pdf' || (deck?.rag?.count || 0) > 0
  const expectsDoc = isPdfDeck && DOC_GROUNDED_INTENTS.has(intent)
  const grounded = !!retrieved

  const topScore = retrieved?.results?.[0]?.score || 0
  const hasPassage = retrieved?.mode === 'passages' && topScore >= PASSAGE_FLOOR
  const weak = retrieved?.mode === 'overview' || (retrieved?.mode === 'passages' && !hasPassage)

  // Insufficient: the learner expects a document answer, but we have no usable
  // passage (either no index at all, or only a weak overview / sub-floor hit).
  const insufficient = expectsDoc && !hasPassage

  return { grounded, expectsDoc, insufficient, weak, isPdfDeck }
}

// Format the relevant flashcards as a compact context block for the prompt.
export function flashcardBlock(cards, max = 6) {
  const list = (cards || []).slice(0, max)
  if (!list.length) return ''
  return list.map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`).join('\n')
}
