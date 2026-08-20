// Adaptive AI Tutor — orchestration.
//
// A single entry point, askTutor(), that turns a learner's question into a
// personalized, source-grounded answer. It composes the dedicated stages, each
// of which lives in its own module and reuses an existing system:
//
//   1. intent detection   → intent.js
//   2. learning state      → learningState.js (coach.js + intelligence.js + srs)
//   3. retrieval           → context.js (retrieval.js RAG + semanticSearch.js)
//   4. context construction→ context.js + prompt.js
//   5. tutor prompting     → prompt.js
//   6. response handling    → runChat (aiService provider abstraction) or the
//                             deterministic offline tutor (demo.js)
//
// The return shape is a superset of the classic assistant's, so the chat UI
// keeps its grounded indicator and Sources footer unchanged:
//   { text, sources, grounded, intent, mode, focus, insufficient }

import {
  runChat,
  buildSources,
  buildRetrievalQuery,
  streamText,
  demoDelay,
  throwIfAborted,
} from '../aiService.js'
import { detectIntent } from './intent.js'
import { collectLearningState, focusLevel } from './learningState.js'
import { gatherContext, groundingStatus } from './context.js'
import { buildTutorSystem } from './prompt.js'
import { demoTutorAnswer } from './demo.js'
import { recommendNext } from '../recommend/index.js'

const MAX_HISTORY = 12 // prior turns sent to the provider for follow-up context

// Map stored chat messages to provider roles, bounded for token safety.
function priorMessages(history) {
  return (history || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.text)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.text) }))
}

// Ask the adaptive tutor.
//   { question, mode, deck, sets, stats, chats, history, settings, user,
//     signal, onToken } -> Promise<{ text, sources, grounded, intent, mode,
//                                    focus, insufficient }>
// `mode` is an explicit UI mode (EXPLAIN/PRACTICE/HINT/…) or 'AUTO' to classify
// the question. Best-effort throughout: retrieval, semantic search and learner
// state each degrade independently, so a missing PDF / no embeddings / no
// history never breaks the answer.
export async function askTutor({
  question,
  mode = 'AUTO',
  deck,
  sets = [],
  stats,
  chats = {},
  history = [],
  settings,
  user,
  signal,
  onToken,
} = {}) {
  const q = String(question || '').trim()
  if (!q) throw new Error('Ask a question to get started.')
  const now = Date.now()

  // 1. Intent / mode.
  const { intent, mode: resolvedMode, style } = detectIntent(q, mode)

  // 2. Learner state (reuses the coach + intelligence brains).
  const state = collectLearningState({ deck, sets, stats, chats, now })

  // For "what should I study?", the RECOMMENDATION ENGINE ranks first; the tutor
  // only explains its ranked output (it never re-ranks). Computed only for the
  // RECOMMEND mode to avoid unnecessary work on other turns.
  const recommendations = resolvedMode === 'RECOMMEND' ? recommendNext({ sets, stats, now, limit: 6 }) : null

  // 3. Retrieval — enrich the query with recent context so follow-ups retrieve
  //    well (same heuristic the classic assistant uses).
  const query = buildRetrievalQuery(q, history)
  const { retrieved, cards } = await gatherContext({
    deck,
    sets,
    user,
    settings,
    query,
    intent,
    signal,
  })
  throwIfAborted(signal) // don't fire the (costly) answer after a cancel

  // 4. Grounding + focus + context blocks.
  const grounding = groundingStatus({ deck, retrieved, intent })
  const focus = focusLevel(cards, state, deck)
  const hasDoc = !!retrieved

  // Citations are known from retrieval, independent of the answer call — and use
  // the SAME builder as the classic assistant, so page/section citations and the
  // grounded indicator are identical.
  const sources = buildSources(retrieved, q, deck)

  // 5. Prompt.
  const { system, snapshot, cardBlock } = buildTutorSystem({
    deck,
    hasDoc,
    mode: resolvedMode,
    style,
    focus,
    state,
    grounding,
    cards,
    recommendations,
  })
  const sourceHeading =
    retrieved?.mode === 'overview'
      ? 'SOURCE TEXT (excerpt from the start of the full document):'
      : 'SOURCE EXCERPTS (most relevant passages from the full document):'
  const sourceBlock = retrieved ? `${sourceHeading}\n${retrieved.text}\n\n` : ''
  const cardsBlock = cardBlock ? `RELEVANT FLASHCARDS:\n${cardBlock}\n\n` : ''
  const snapshotBlock = snapshot ? `${snapshot}\n\n` : ''
  const fullSystem = `${system}\n\n${snapshotBlock}${sourceBlock}${cardsBlock}`.trim()

  const msgs = [...priorMessages(history), { role: 'user', content: q }]

  // 6. Answer — provider, or the deterministic offline tutor in Demo mode.
  let text = await runChat({ system: fullSystem, messages: msgs, settings, signal, onToken })
  if (text == null) {
    await demoDelay(300, signal)
    const answer = demoTutorAnswer({
      mode: resolvedMode,
      style,
      question: q,
      deck,
      retrieved,
      cards,
      state,
      focus,
      grounding,
      recommendations,
    })
    text = await streamText(answer, onToken, signal)
  }

  return {
    text,
    sources,
    grounded: hasDoc,
    intent,
    mode: resolvedMode,
    focus: focus.level,
    insufficient: !!grounding.insufficient,
  }
}
