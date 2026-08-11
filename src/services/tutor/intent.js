// Tutor intent detection.
//
// Maps a learner's question (or an explicit UI mode) onto one of the tutor's
// behavioral MODES. The chat's mode buttons (Explain / Practice / Hint /
// Review) pass an explicit mode that always wins; a free-typed question is
// classified by keyword. Every intent resolves to exactly one mode so the
// orchestrator has a single switch to drive prompting and the offline demo.
//
// Pure, dependency-light and deterministic (so Demo mode and tests behave
// identically). Reuses the coaching-question heuristic from coach.js so
// "what should I study next?" routes to RECOMMEND consistently with the
// existing coach.

import { isCoachingQuestion } from '../coach.js'

// Behavioral modes the tutor supports.
export const MODES = ['EXPLAIN', 'PRACTICE', 'HINT', 'MISCONCEPTION', 'REVIEW', 'RECOMMEND', 'AUTO']

// Fine-grained intents (spec §CONTEXT PIPELINE step 1). Each carries a `mode`
// (the behavior) and a `style` (a sub-flavor used to shape EXPLAIN answers).
const INTENTS = {
  explain: { mode: 'EXPLAIN', style: 'explain' },
  summarize: { mode: 'EXPLAIN', style: 'summarize' },
  example: { mode: 'EXPLAIN', style: 'example' },
  compare: { mode: 'EXPLAIN', style: 'compare' },
  test: { mode: 'PRACTICE', style: 'practice' },
  practice: { mode: 'PRACTICE', style: 'practice' },
  hint: { mode: 'HINT', style: 'hint' },
  misconception: { mode: 'MISCONCEPTION', style: 'misconception' },
  review: { mode: 'REVIEW', style: 'review' },
  recommend: { mode: 'RECOMMEND', style: 'recommend' },
}

// Ordered keyword rules — first match wins, so more specific intents are tested
// before broad ones (e.g. "why did I get this wrong" → misconception before the
// generic "why → explain").
const RULES = [
  [/\bwrong\b|\bmistake\b|got (it|this|that)? ?(wrong|incorrect)|why (did|was) i|\bmisconcept|why is my answer|keep (getting|missing)/i, 'misconception'],
  [/\bhint\b|nudge|clue|point me|without (telling|giving|the answer)|don'?t tell me/i, 'hint'],
  [/\bquiz me\b|\btest me\b|practice question|give me a (question|problem)|create a (question|problem)|check my (knowledge|understanding)|quiz question/i, 'practice'],
  [/what (should|do) i (study|review|learn|do) next|what'?s next|recommend|where (should|do) i (start|focus)|plan my|prioriti|what to study/i, 'recommend'],
  [/\breview\b|due (cards|today|now)|weak (spot|area|card)|revise|revision|what.*forgotten|need(s)? (revision|reinforc)/i, 'review'],
  [/compare|contrast|\bvs\b|versus|difference between|differ/i, 'compare'],
  [/summar|\btl;?dr\b|in (a )?nutshell|key points|overview of/i, 'summarize'],
  [/example|for instance|real.?world|use ?case|illustrat|show me how/i, 'example'],
  [/explain|what is|what are|define|describe|how does|how do|tell me about|help me understand|teach me|why/i, 'explain'],
]

// Normalize a UI mode string ('EXPLAIN', 'practice', …) to a known mode, or null.
function normalizeMode(mode) {
  if (!mode) return null
  const m = String(mode).toUpperCase()
  return MODES.includes(m) && m !== 'AUTO' ? m : null
}

// Detect the tutor intent for a question. An explicit, non-AUTO `mode` (from a
// mode button) always wins and is returned with a matching style. Otherwise the
// question is classified by keyword, falling back to coach detection and finally
// to EXPLAIN. Returns { intent, mode, style }.
export function detectIntent(question, mode) {
  const forced = normalizeMode(mode)
  if (forced) {
    // Find an intent whose mode matches, to carry a sensible style.
    const entry = Object.entries(INTENTS).find(([, v]) => v.mode === forced)
    const style = entry ? entry[1].style : forced.toLowerCase()
    const intent = entry ? entry[0] : forced.toLowerCase()
    return { intent, mode: forced, style }
  }

  const q = String(question || '')
  for (const [re, intent] of RULES) {
    if (re.test(q)) {
      const { mode: m, style } = INTENTS[intent]
      return { intent, mode: m, style }
    }
  }

  // No keyword hit — let the existing coach heuristic catch progress questions.
  if (isCoachingQuestion(q)) {
    return { intent: 'recommend', mode: 'RECOMMEND', style: 'recommend' }
  }

  return { intent: 'explain', mode: 'EXPLAIN', style: 'explain' }
}
