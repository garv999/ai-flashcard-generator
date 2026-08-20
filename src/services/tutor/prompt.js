// Tutor prompting.
//
// Builds the system prompt for the LLM providers from four ingredients:
//   • the base tutor role + RAG grounding rules (preserved from the classic
//     assistant, so citations and document-first answering are unchanged);
//   • an ADAPTATION clause driven by the learner's grasp of the focused concept
//     (new / weak / partial / strong / missed);
//   • a MODE clause for the behavior (explain / practice / hint / …);
//   • the assembled context blocks (learner snapshot, source excerpts,
//     flashcards) which the orchestrator appends.
//
// Pure string composition — no I/O, so it is trivially testable.

import { coachContextText } from '../coach.js'
import { flashcardBlock } from './context.js'
import { recommendationContextText } from '../recommend/index.js'

// How to pitch the answer given the learner's grasp of the concept (spec
// §ADAPTIVE BEHAVIOR). Keyed by focusLevel().level.
const ADAPTATION = {
  new: 'The learner is NEW to this concept (no recall history). Explain simply and from first principles, use one intuitive example, and do not assume prior knowledge.',
  weak: 'The learner is WEAK on this concept (fragile recall). Explain simply and concretely, slow down on the tricky part, and use an intuitive example. Avoid jargon.',
  partial:
    'The learner PARTIALLY knows this concept. Give a concise explanation, connect it to concepts they have already studied, and end with one short checking question.',
  strong:
    'The learner is STRONG on this concept (mastered). Be concise, skip the basics, use a deeper or edge-case example, and encourage application rather than repetition.',
  missed:
    'The learner RECENTLY GOT THIS WRONG / keeps forgetting it. Identify the likely misconception, contrast it with the correct idea, and give one similar practice item to re-anchor it.',
  unknown: 'Pitch the explanation at a general level appropriate to the material.',
}

// Behavior for each mode (spec §TUTOR MODES).
const MODE_CLAUSE = {
  EXPLAIN: {
    explain: 'MODE — EXPLAIN: Explain the concept the learner asked about using the source material.',
    summarize: 'MODE — SUMMARIZE: Give a tight summary of the relevant material, the key points only.',
    example: 'MODE — EXAMPLE: Give one concrete, relevant example grounded in the material.',
    compare: 'MODE — COMPARE: Compare the two concepts from the material, drawing out the key difference.',
  },
  PRACTICE:
    'MODE — PRACTICE: Generate exactly ONE practice question grounded in the source material (and the flashcards). Ask the question and invite the learner to answer. Do NOT reveal the answer in this turn.',
  HINT: 'MODE — HINT: Give ONE helpful hint that points the learner toward the idea. You must NOT state or restate the answer, the definition, or the key fact — only nudge. End by inviting them to try.',
  MISCONCEPTION:
    "MODE — MISCONCEPTION: Explain why the learner's previous answer was likely incorrect. Name the specific misconception, contrast it with the correct understanding using the material, then give one similar practice question to reinforce it.",
  REVIEW:
    'MODE — REVIEW: Connect the question to the learner’s weak, forgotten, and due cards for this deck (listed in the snapshot). Explain the shared idea and recommend which of those to review first.',
  RECOMMEND:
    'MODE — RECOMMEND: Recommend what to study next. Base the recommendation ONLY on the STUDENT PROGRESS SNAPSHOT (due cards, weak areas, revision priorities, streak). Be specific, prioritized and actionable.',
}

// Resolve the mode clause, honoring the EXPLAIN sub-styles.
function modeClause(mode, style) {
  if (mode === 'EXPLAIN') return MODE_CLAUSE.EXPLAIN[style] || MODE_CLAUSE.EXPLAIN.explain
  return MODE_CLAUSE[mode] || MODE_CLAUSE.EXPLAIN.explain
}

// The adaptation clause for a focus level.
export function adaptationFor(level) {
  return ADAPTATION[level] || ADAPTATION.unknown
}

// Base grounding rules — kept aligned with the classic assistant so document
// answers stay citation-grounded and never silently wander off-source.
function groundingRules(kind, hasDoc, grounding) {
  if (hasDoc) {
    let rules =
      `Answer PRIMARILY from the SOURCE EXCERPTS below — the passages retrieved from the full ${kind} for this question. ` +
      `Treat them as your source of truth and use the FLASHCARDS only as supplementary context. ` +
      `Never invent citations or facts not present in the material. `
    if (grounding?.insufficient || grounding?.weak) {
      rules +=
        `IMPORTANT: if the excerpts do not actually contain enough to answer the question, say so plainly ` +
        `("the available study material doesn't cover this in enough detail") and do NOT fill the gap with outside knowledge presented as if it were from the ${kind}. `
    }
    return rules
  }
  return `Use the provided FLASHCARDS below as your primary source of truth about what the learner is studying. `
}

// Build the full tutor system prompt.
//   deck       — active deck
//   hasDoc     — document passages/overview are available
//   mode/style — from detectIntent
//   focus      — from focusLevel (level + concept)
//   state      — from collectLearningState (for the snapshot + context blocks)
//   grounding  — from groundingStatus
//   cards      — semantic flashcard matches (for the flashcard block)
export function buildTutorSystem({ deck, hasDoc, mode, style, focus, state, grounding, cards, recommendations }) {
  const topic = deck?.topic || 'the selected deck'
  const kind = deck?.source === 'pdf' ? 'uploaded PDF' : 'study deck'

  const base =
    `You are an adaptive AI tutor helping a learner study their ${kind} titled "${topic}". ` +
    `You are personal and specific — you adapt to what this learner already knows and answer from their real material, ` +
    `not generic knowledge. Be clear, accurate and concise: a few short paragraphs at most, plain text (no markdown headings). ` +
    `When a concept is genuinely clearer shown visually, you may include ONE Mermaid diagram in a ` +
    '```mermaid fenced block' +
    ` (graph TD for a process/hierarchy, or a timeline) or a Markdown table for a comparison — never force one where prose is clearer.`

  const grounding_ = groundingRules(kind, hasDoc, grounding)
  const adaptation = `LEARNER ADAPTATION: ${adaptationFor(focus?.level)}${focus?.concept ? ` Focused concept: "${focus.concept}".` : ''}`
  const modeText = modeClause(mode, style)

  // Context blocks. For RECOMMEND, append the recommendation engine's ranked
  // output so the tutor explains it rather than inventing its own ranking.
  const recBlock =
    mode === 'RECOMMEND' && recommendations?.cards?.length
      ? `\n\n${recommendationContextText(recommendations)}`
      : ''
  const snapshot = state?.briefing
    ? `STUDENT PROGRESS SNAPSHOT:\n${coachContextText(state.briefing)}\n${learnerConceptLines(state)}${recBlock}`
    : recBlock
  const cardBlock = flashcardBlock(cards)

  return {
    system: [base, grounding_, adaptation, modeText].join('\n\n'),
    snapshot,
    cardBlock,
  }
}

// Extra concept-level lines for the snapshot: this deck's weak / recently
// forgotten / mastered concepts, so the tutor can reference them by name.
function learnerConceptLines(state) {
  const d = state?.deck
  if (!d) return ''
  const lines = []
  if (d.weakConcepts?.length)
    lines.push(`Weak concepts here: ${d.weakConcepts.slice(0, 4).map((c) => c.concept).join('; ')}.`)
  if (d.forgotten?.length)
    lines.push(`Recently forgotten here: ${d.forgotten.slice(0, 4).map((c) => c.concept).join('; ')}.`)
  if (d.mastered?.length)
    lines.push(`Already mastered here: ${d.mastered.slice(0, 4).map((c) => c.question).join('; ')}.`)
  if (d.dueCount) lines.push(`Cards due now in this deck: ${d.dueCount}.`)
  return lines.join('\n')
}
