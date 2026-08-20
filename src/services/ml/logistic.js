// Logistic regression — a tiny, dependency-free, fully deterministic
// implementation, trained with full-batch gradient descent and L2
// regularization on standardized features.
//
// Why logistic regression (not a Random Forest / Gradient Boosting):
//   • Interpretable — each feature has a single signed weight, so a per-card
//     prediction decomposes into human-readable reasons (weight × feature).
//   • Right-sized for the data — a single learner produces at most a few
//     hundred labeled reviews; tree ensembles overfit that badly, LR does not.
//   • Lightweight & explainable — ~40 lines, no dependency, outputs a calibrated
//     probability directly from the sigmoid. This matches the brief: an
//     interpretable baseline, practical for an individual learner, client-side.
//
// Deterministic: weights initialize to zero and training is plain batch GD with
// a fixed schedule, so the same data always yields the same model (tests and the
// cache fingerprint rely on this).

const EPS = 1e-8

export function sigmoid(z) {
  // Numerically stable logistic.
  if (z >= 0) return 1 / (1 + Math.exp(-z))
  const e = Math.exp(z)
  return e / (1 + e)
}

// Column-wise standardization stats for a feature matrix.
function standardizer(X) {
  const n = X.length
  const d = X[0]?.length || 0
  const mean = new Array(d).fill(0)
  const std = new Array(d).fill(0)
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j]
  for (let j = 0; j < d; j++) mean[j] /= n || 1
  for (const row of X) for (let j = 0; j < d; j++) std[j] += (row[j] - mean[j]) ** 2
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / (n || 1)) || 0
  return { mean, std }
}

function standardizeRow(row, mean, std) {
  return row.map((v, j) => (v - mean[j]) / (std[j] + EPS))
}

// Train a logistic-regression classifier.
//   X : number[][]  feature matrix (raw, pre-standardization)
//   y : number[]    binary labels (1 = forgotten / incorrect)
//   opts.l2, opts.lr, opts.epochs
// Returns a model: { w, b, mean, std, n, epochs }. Standardization stats are
// stored on the model so predict() applies the identical transform.
export function train(X, y, { l2 = 1.0, lr = 0.3, epochs = 400 } = {}) {
  const n = X.length
  const d = X[0]?.length || 0
  const { mean, std } = standardizer(X)
  const Z = X.map((row) => standardizeRow(row, mean, std))

  const w = new Array(d).fill(0)
  let b = 0

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = new Array(d).fill(0)
    let gb = 0
    for (let i = 0; i < n; i++) {
      let z = b
      for (let j = 0; j < d; j++) z += w[j] * Z[i][j]
      const err = sigmoid(z) - y[i]
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j]
      gb += err
    }
    // L2 applies to weights only, never the bias.
    for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + (l2 / n) * w[j])
    b -= lr * (gb / n)
  }

  return { w, b, mean, std, n, epochs }
}

// Standardize a raw feature vector against the model's training stats.
export function standardize(model, xRaw) {
  return standardizeRow(xRaw, model.mean, model.std)
}

// Predicted probability of the positive class (forgetting) for a raw vector.
export function predict(model, xRaw) {
  const z = standardize(model, xRaw)
  let s = model.b
  for (let j = 0; j < model.w.length; j++) s += model.w[j] * z[j]
  return sigmoid(s)
}

// Per-feature signed contribution to the log-odds (weight × standardized value),
// used to explain a prediction. Returns number[] aligned with the features.
export function contributions(model, xRaw) {
  const z = standardize(model, xRaw)
  return model.w.map((wj, j) => wj * z[j])
}

// Honest accuracy on a labeled set (no fabricated benchmark — this is just the
// share correctly classified at the 0.5 threshold on whatever set is passed).
export function accuracy(model, X, y) {
  if (!X.length) return null
  let correct = 0
  for (let i = 0; i < X.length; i++) {
    const p = predict(model, X[i])
    if ((p >= 0.5 ? 1 : 0) === y[i]) correct++
  }
  return correct / X.length
}
