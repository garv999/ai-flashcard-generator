// ML Evaluation + Learning Outcomes — public API.
//
// Composes the evaluation sub-modules into a single report the Analytics UI can
// render, plus the record* hooks the app calls at review / recommendation time.
// Everything is computed from REAL review outcomes; nothing here fabricates a
// number, and every sub-report carries an explicit availability flag so the UI
// can distinguish "0" from "Not enough data".
//
// Privacy: all inputs come from device-local logs (ml events + evaluation events
// + recommendation logs). No data is sent to an LLM or any external service.

import { loadEvents } from '../dataset.js'
import { loadEvalEvents } from './events.js'
import { classificationMetrics, MIN } from './metrics.js'
import { calibration } from './calibration.js'
import { compareMlVsSrs } from './comparison.js'
import { recommendationMetrics } from './outcomes.js'

// Record hooks (re-exported so the app imports a single evaluation entry point).
export { recordReviewEvaluation, loadEvalEvents, clearEvalEvents } from './events.js'
export {
  recordRecommendationImpression,
  recordRecommendationAccepted,
  attributeRecommendationOutcome,
  clearRecOutcomes,
} from './outcomes.js'
export { MIN } from './metrics.js'

// Build the full evaluation report from the device-local logs.
export function evaluationReport({ now = Date.now() } = {}) {
  const reviewEvents = loadEvents()
  const evalEvents = loadEvalEvents()

  // Records for the DEPLOYED prediction (ML where available, else SRS) — the
  // "as-shipped" prediction quality the learner actually experiences.
  const deployed = evalEvents.map((e) => ({ p: e.pModel != null ? e.pModel : e.pSrs, y: e.outcome }))
  // Model-only records (leakage-free, model-produced predictions only).
  const modelRecords = evalEvents.filter((e) => e.pModel != null).map((e) => ({ p: e.pModel, y: e.outcome }))

  const modelPerformance = buildModelPerformance(evalEvents, modelRecords, deployed)
  const cal = calibration(modelRecords.length >= MIN.basic ? modelRecords : deployed)
  const mlVsSrs = compareMlVsSrs(evalEvents)
  const recommendations = recommendationMetrics({ now })

  const evaluatedWithModel = evalEvents.filter((e) => e.pModel != null).length
  const coverage = {
    evaluatedPredictions: evalEvents.length,
    totalReviewEvents: reviewEvents.length,
    modelEvaluated: evaluatedWithModel,
    mlCoverage: evalEvents.length ? Math.round((evaluatedWithModel / evalEvents.length) * 1000) / 1000 : null,
  }

  return {
    generatedAt: new Date(now).toISOString(),
    dataState: dataState(evalEvents, modelRecords, recommendations),
    modelPerformance,
    calibration: cal,
    mlVsSrs,
    recommendations,
    coverage,
  }
}

function buildModelPerformance(evalEvents, modelRecords, deployed) {
  // Prefer model-only metrics; fall back to the deployed prediction stream so
  // there is still an honest number before the model has produced many preds.
  const usingModel = modelRecords.length >= MIN.basic
  const records = usingModel ? modelRecords : deployed
  if (records.length < MIN.basic) {
    return { available: false, n: records.length, min: MIN.basic, source: usingModel ? 'ML' : 'deployed' }
  }
  const versions = [...new Set(evalEvents.filter((e) => e.modelVersion != null).map((e) => e.modelVersion))]
  return {
    available: true,
    source: usingModel ? 'ML' : 'deployed',
    metrics: classificationMetrics(records),
    modelVersions: versions, // evaluation history spans these versions
  }
}

// A single coarse label for the current data situation, for UI copy.
function dataState(evalEvents, modelRecords, rec) {
  if (evalEvents.length === 0) return 'no-data'
  if (modelRecords.length < MIN.basic) return 'insufficient-eval'
  if (!rec.available) return 'metrics-ready-no-recs'
  return 'full'
}
