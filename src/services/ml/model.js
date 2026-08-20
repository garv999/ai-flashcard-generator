// Model training, caching, persistence and versioning.
//
// The model trains ONLY when enough real labeled reviews exist (a clear
// threshold, with both outcomes represented). Below that it stays unavailable
// and callers fall back to the SRS difficulty estimate. Above it, the trained
// weights are cached — in memory and in localStorage — keyed by a dataset
// fingerprint, so it is reused until the underlying data materially changes
// (never retrained on every render).

import { train, accuracy } from './logistic.js'
import { buildTrainingData, fingerprint } from './dataset.js'
import { FEATURE_KEYS } from './features.js'

const MODEL_KEY = 'aifc.ml.model'
export const MODEL_VERSION = 1
// Training threshold: minimum labeled reviews, and minimum of each class, before
// a personalized model is trustworthy enough to train.
export const TRAINING_THRESHOLD = 40
const MIN_PER_CLASS = 6
// Hold out a deterministic validation slice for an HONEST accuracy figure once
// there is enough data (no fabricated benchmark — this is measured, or null).
const VALIDATION_MIN = 80

// In-memory cache so repeated calls within a session don't re-read/re-train.
let memo = null // { fingerprint, model, meta }

function loadPersisted() {
  try {
    const raw = JSON.parse(localStorage.getItem(MODEL_KEY) || 'null')
    if (raw && raw.version === MODEL_VERSION && Array.isArray(raw.w) && raw.w.length === FEATURE_KEYS.length) return raw
  } catch {
    /* ignore */
  }
  return null
}

function persist(record) {
  try {
    localStorage.setItem(MODEL_KEY, JSON.stringify(record))
  } catch {
    /* quota — the in-memory memo still serves this session */
  }
}

// Deterministic split: every 5th usable example → validation. Only used when the
// dataset is large enough that holding out a slice still leaves plenty to train.
function splitTrainVal(X, y) {
  if (X.length < VALIDATION_MIN) return { Xtr: X, ytr: y, Xval: [], yval: [] }
  const Xtr = [], ytr = [], Xval = [], yval = []
  for (let i = 0; i < X.length; i++) {
    if (i % 5 === 4) { Xval.push(X[i]); yval.push(y[i]) }
    else { Xtr.push(X[i]); ytr.push(y[i]) }
  }
  return { Xtr, ytr, Xval, yval }
}

// Whether the dataset can support a personalized model.
export function canTrain(events) {
  const { n, positives } = buildTrainingData(events)
  const negatives = n - positives
  return n >= TRAINING_THRESHOLD && positives >= MIN_PER_CLASS && negatives >= MIN_PER_CLASS
}

// Get a trained model for the current events, training + caching as needed.
// Returns { model, meta } when available, or { model: null, reason, meta } when
// there isn't enough data yet (the cold-start case).
export function getModel(events) {
  const fp = fingerprint(events)

  // In-memory reuse.
  if (memo && memo.fingerprint === fp) return memo

  // Persisted reuse (survives reloads) — only if the data hasn't changed.
  const persisted = loadPersisted()
  if (persisted && persisted.fingerprint === fp) {
    memo = { fingerprint: fp, model: persisted, meta: metaFrom(persisted) }
    return memo
  }

  if (!canTrain(events)) {
    const { n, positives } = buildTrainingData(events)
    const result = {
      model: null,
      reason: 'insufficient-data',
      meta: { available: false, n, positives, threshold: TRAINING_THRESHOLD, version: MODEL_VERSION },
    }
    memo = { fingerprint: fp, ...result }
    return memo
  }

  const { X, y } = buildTrainingData(events)
  const { Xtr, ytr, Xval, yval } = splitTrainVal(X, y)
  const trained = train(Xtr, ytr)
  const valAccuracy = Xval.length ? Math.round(accuracy(trained, Xval, yval) * 100) / 100 : null
  const trainAccuracy = Math.round(accuracy(trained, Xtr, ytr) * 100) / 100

  const record = {
    version: MODEL_VERSION,
    fingerprint: fp,
    w: trained.w,
    b: trained.b,
    mean: trained.mean,
    std: trained.std,
    n: X.length,
    trainedAt: now(),
    valAccuracy, // honest held-out accuracy, or null when the sample is small
    trainAccuracy,
  }
  persist(record)
  memo = { fingerprint: fp, model: record, meta: metaFrom(record) }
  return memo
}

function metaFrom(record) {
  return {
    available: true,
    version: record.version,
    n: record.n,
    trainedAt: record.trainedAt,
    valAccuracy: record.valAccuracy ?? null,
    trainAccuracy: record.trainAccuracy ?? null,
  }
}

// `now` is wrapped so tests can keep persistence deterministic if needed. The
// app passes real time; nothing about training depends on it.
function now() {
  return new Date().toISOString()
}

// Test/util hook: drop the in-memory memo (does not touch persisted model).
export function _resetMemo() {
  memo = null
}
