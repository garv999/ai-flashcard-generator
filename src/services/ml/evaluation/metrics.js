// Classification metrics — pure, deterministic, and gated by minimum sample
// size so misleading numbers are never produced from thin data.
//
// Every function takes records of the form { p, y } where p is a predicted
// probability in [0,1] and y is the actual binary outcome (1 = forgotten). Each
// metric returns null when there isn't enough data (or a denominator is zero);
// callers render "Not enough data" for nulls rather than a misleading 0.

// Documented minimum sample requirements per metric.
export const MIN = {
  basic: 20, // accuracy, precision, recall, F1, Brier, confusion matrix
  auc: 30, // ROC-AUC (also needs both classes present)
  perClass: 8, // minimum of each class for AUC / PR-AUC to be meaningful
  prAuc: 30, // PR-AUC (average precision)
  comparison: 25, // ML-labeled evaluations required for ML vs SRS
}

const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000)

// Confusion matrix at a decision threshold (default 0.5).
export function confusion(records, threshold = 0.5) {
  if (records.length < MIN.basic) return null
  let tp = 0, fp = 0, tn = 0, fn = 0
  for (const { p, y } of records) {
    const pred = p >= threshold ? 1 : 0
    if (pred === 1 && y === 1) tp++
    else if (pred === 1 && y === 0) fp++
    else if (pred === 0 && y === 0) tn++
    else fn++
  }
  return { tp, fp, tn, fn }
}

export function accuracy(records, threshold = 0.5) {
  const c = confusion(records, threshold)
  if (!c) return null
  const n = c.tp + c.fp + c.tn + c.fn
  return round3((c.tp + c.tn) / n)
}

export function precision(records, threshold = 0.5) {
  const c = confusion(records, threshold)
  if (!c) return null
  const denom = c.tp + c.fp
  return denom === 0 ? null : round3(c.tp / denom)
}

export function recall(records, threshold = 0.5) {
  const c = confusion(records, threshold)
  if (!c) return null
  const denom = c.tp + c.fn
  return denom === 0 ? null : round3(c.tp / denom)
}

export function f1(records, threshold = 0.5) {
  const p = precision(records, threshold)
  const r = recall(records, threshold)
  if (p == null || r == null || p + r === 0) return null
  return round3((2 * p * r) / (p + r))
}

// Brier score — mean squared error of the probabilities (lower is better).
export function brier(records) {
  if (records.length < MIN.basic) return null
  const s = records.reduce((acc, { p, y }) => acc + (p - y) ** 2, 0)
  return round3(s / records.length)
}

// ROC-AUC via the Mann-Whitney U statistic, with average-rank tie handling.
export function rocAuc(records) {
  if (records.length < MIN.auc) return null
  const pos = records.filter((r) => r.y === 1).length
  const neg = records.length - pos
  if (pos < MIN.perClass || neg < MIN.perClass) return null

  const sorted = [...records].sort((a, b) => a.p - b.p)
  const ranks = new Array(sorted.length)
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1].p === sorted[i].p) j++
    const avg = (i + 1 + (j + 1)) / 2 // average of 1-based ranks in the tie block
    for (let k = i; k <= j; k++) ranks[k] = avg
    i = j + 1
  }
  let sumPos = 0
  for (let k = 0; k < sorted.length; k++) if (sorted[k].y === 1) sumPos += ranks[k]
  return round3((sumPos - (pos * (pos + 1)) / 2) / (pos * neg))
}

// PR-AUC estimated as Average Precision (area under the precision-recall curve
// via the step-wise sum over positives).
export function prAuc(records) {
  if (records.length < MIN.prAuc) return null
  const pos = records.filter((r) => r.y === 1).length
  if (pos < MIN.perClass) return null
  const sorted = [...records].sort((a, b) => b.p - a.p)
  let tp = 0, fp = 0, ap = 0
  for (const r of sorted) {
    if (r.y === 1) {
      tp++
      ap += tp / (tp + fp) // precision at this positive
    } else fp++
  }
  return round3(ap / pos)
}

// Full metric bundle for a record set (nulls where insufficient).
export function classificationMetrics(records) {
  const pos = records.filter((r) => r.y === 1).length
  return {
    n: records.length,
    positives: pos,
    negatives: records.length - pos,
    accuracy: accuracy(records),
    precision: precision(records),
    recall: recall(records),
    f1: f1(records),
    rocAuc: rocAuc(records),
    prAuc: prAuc(records),
    brier: brier(records),
    confusion: confusion(records),
    hasBasic: records.length >= MIN.basic,
    hasAuc: rocAuc(records) != null,
  }
}
