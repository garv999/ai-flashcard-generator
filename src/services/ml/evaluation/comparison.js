// ML vs SRS comparison.
//
// Both the model prediction (pModel) and the SRS estimate (pSrs) are stored on
// every evaluation event, so they can be scored on IDENTICAL outcomes. We only
// compare on events where the model actually produced a prediction (pModel !=
// null), so the two are judged on the same eligible reviews. We never manufacture
// an "improvement %": we surface each side's real metrics and, at most, the
// signed difference between two measured numbers, clearly labeled.

import { classificationMetrics, MIN } from './metrics.js'

export function compareMlVsSrs(evalEvents) {
  // Only events where the ML model was available (fair, same-outcome subset).
  const usable = evalEvents.filter((e) => e.pModel != null)
  if (usable.length < MIN.comparison) {
    return {
      available: false,
      n: usable.length,
      min: MIN.comparison,
      message: 'ML comparison unavailable until sufficient review history exists.',
    }
  }
  const mlRecords = usable.map((e) => ({ p: e.pModel, y: e.outcome }))
  const srsRecords = usable.map((e) => ({ p: e.pSrs, y: e.outcome }))

  const ml = classificationMetrics(mlRecords)
  const srs = classificationMetrics(srsRecords)

  // Signed differences between two measured metrics (not a causal "improvement").
  const diff = (a, b) => (a == null || b == null ? null : Math.round((a - b) * 1000) / 1000)
  return {
    available: true,
    n: usable.length,
    ml,
    srs,
    delta: {
      // For AUC/accuracy/F1 higher is better; for Brier lower is better.
      rocAuc: diff(ml.rocAuc, srs.rocAuc),
      accuracy: diff(ml.accuracy, srs.accuracy),
      f1: diff(ml.f1, srs.f1),
      brier: diff(ml.brier, srs.brier), // negative means ML has lower (better) Brier
    },
  }
}
