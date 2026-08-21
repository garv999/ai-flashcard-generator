// Exam grading — pure and deterministic. Scores the session and breaks results
// down by ML/SRS forgetting-risk band, plus a predicted-vs-observed list that
// mirrors the evaluation layer's philosophy (was the model right about which
// cards were fragile?). No causal claims; purely descriptive of this attempt.

const EMPTY_BAND = () => ({ correct: 0, total: 0 })

// Grade an exam from its blueprint + the session's answer records.
//   { blueprint, records } where each record = { cardIndex, correct }
export function gradeExam({ blueprint, records = [] } = {}) {
  const total = records.length
  const correct = records.filter((r) => r.correct).length
  const pct = total ? Math.round((correct / total) * 100) : 0

  const metaByIdx = new Map((blueprint?.items || []).map((it) => [it.cardIndex, it]))
  const bands = { high: EMPTY_BAND(), medium: EMPTY_BAND(), low: EMPTY_BAND() }
  const predictedVsObserved = []

  for (const r of records) {
    const m = metaByIdx.get(r.cardIndex) || {}
    const band = m.band || 'low'
    bands[band].total++
    if (r.correct) bands[band].correct++
    predictedVsObserved.push({
      cardIndex: r.cardIndex,
      riskProb: m.riskProb ?? null,
      source: m.source || null,
      band,
      correct: !!r.correct,
    })
  }

  // "Weak" = high-risk items; "rest" = medium + low. Lets the UI show whether
  // the exam's hardest (predicted-fragile) items were the ones missed.
  const weak = { correct: bands.high.correct, total: bands.high.total }
  const rest = {
    correct: bands.medium.correct + bands.low.correct,
    total: bands.medium.total + bands.low.total,
  }
  const rate = (b) => (b.total ? Math.round((b.correct / b.total) * 100) : null)

  return {
    pct,
    correct,
    total,
    bands,
    weak,
    rest,
    weakAccuracy: rate(weak),
    restAccuracy: rate(rest),
    predictedVsObserved,
    missedCardIndices: [...new Set(records.filter((r) => !r.correct).map((r) => r.cardIndex))],
    source: blueprint?.source || 'SRS',
  }
}
