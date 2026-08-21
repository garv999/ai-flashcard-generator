// AI-Generated Adaptive Practice Exam — public API.
//
// Composition only; the real work lives in the focused modules:
//   blueprint.js — deterministic selection (reuses the recommendation engine)
//   generate.js  — question construction (reuses quiz engine + RAG grounding)
//   grade.js     — scoring + risk-band breakdown + predicted-vs-observed
//   persist.js   — exam attempt records on the deck
//
// The engine selects; the LLM only phrases. Exams never touch SRS, the ML
// training log, or the evaluation log.

export { buildBlueprint, riskBand } from './blueprint.js'
export { generateExam } from './generate.js'
export { gradeExam } from './grade.js'
export { foldExamResult, isNewBestExam, examStats } from './persist.js'

// Convenience one-shot: blueprint then generate. Callers that need to inspect
// the blueprint first (e.g. to warn "only N of M cards eligible") can call the
// two steps separately.
import { buildBlueprint } from './blueprint.js'
import { generateExam } from './generate.js'

export async function buildExam({ deck, stats, now = Date.now(), length = 10, focusWeak = true, settings, user, signal } = {}) {
  const blueprint = buildBlueprint({ deck, stats, now, length, focusWeak })
  if (!blueprint.canBuild) return { blueprint, questions: [], grounded: false, source: blueprint.source }
  const gen = await generateExam({ deck, blueprint, settings, user, signal })
  return { blueprint, ...gen }
}
