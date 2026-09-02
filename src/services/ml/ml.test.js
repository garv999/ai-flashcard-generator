import { describe, it, expect } from 'vitest'
import { extractFeatures, srsDifficulty, FEATURE_KEYS } from './features.js'
import { train, predict } from './logistic.js'
import { recordReviewEvent, buildTrainingData, fingerprint, saveEvents } from './dataset.js'
import { getModel, canTrain, TRAINING_THRESHOLD } from './model.js'
import { predictForgetting } from './index.js'

const DAY = 864e5
const now = 1_700_000_000_000
const iso = (d) => new Date(now + d * DAY).toISOString()
const inUnit = (v) => typeof v === 'number' && v >= 0 && v <= 1

// Build a synthetic labelled review log where staleness/fragility predicts the
// lapse, so the model has a genuine signal to learn. Distinct card per event so
// per-card history doesn't dominate.
function makeEvents({ hard = 0, easy = 0 } = {}) {
  let events = []
  let idx = 0
  for (let i = 0; i < hard; i++, idx++) {
    events = recordReviewEvent({ events, deckId: 'x', cardIndex: idx, card: { srs: { reps: 1, ease: 1.7, interval: 4, due: iso(-20), last: iso(-25) } }, rating: 'again', now }).events
  }
  for (let i = 0; i < easy; i++, idx++) {
    events = recordReviewEvent({ events, deckId: 'x', cardIndex: idx, card: { srs: { reps: 5, ease: 2.6, interval: 20, due: iso(6), last: iso(-1) } }, rating: 'good', now }).events
  }
  return events
}

describe('ml/features', () => {
  it('produces a normalized feature vector aligned to FEATURE_KEYS', () => {
    const { vector, named } = extractFeatures({ card: { srs: { reps: 3, ease: 2.0, interval: 6, due: iso(-2), last: iso(-8) } }, priorEvents: [], now })
    expect(vector).toHaveLength(FEATURE_KEYS.length)
    expect(vector.every(inUnit)).toBe(true)
    expect(named.daysSinceLast).toBeGreaterThan(0)
    expect(named.easeInv).toBeGreaterThan(0)
  })

  it('scores a staler card higher on time-since-review', () => {
    const stale = extractFeatures({ card: { srs: { reps: 3, ease: 2.0, interval: 6, due: iso(-2), last: iso(-8) } }, priorEvents: [], now }).named
    const fresh = extractFeatures({ card: { srs: { reps: 8, ease: 2.7, interval: 40, due: iso(10), last: iso(-1) } }, priorEvents: [], now }).named
    expect(stale.daysSinceLast).toBeGreaterThan(fresh.daysSinceLast)
  })

  it('srsDifficulty is bounded and ranks a fragile card above a mastered one', () => {
    const hard = srsDifficulty({ srs: { reps: 0, ease: 1.4, interval: 0, due: iso(-5), last: iso(-9) } }, now)
    const easy = srsDifficulty({ srs: { reps: 6, ease: 2.7, interval: 40, due: iso(10), last: iso(-1) } }, now)
    expect(inUnit(hard)).toBe(true)
    expect(inUnit(easy)).toBe(true)
    expect(hard).toBeGreaterThan(easy)
  })
})

describe('ml/dataset', () => {
  it('assembles a binary training matrix from the event log', () => {
    const events = makeEvents({ hard: 5, easy: 5 })
    const { X, y, n, positives } = buildTrainingData(events)
    expect(n).toBe(10)
    expect(positives).toBe(5)
    expect(X.every((r) => r.length === FEATURE_KEYS.length)).toBe(true)
    expect(y.every((v) => v === 0 || v === 1)).toBe(true)
  })

  it('fingerprint changes when the data materially changes', () => {
    const a = makeEvents({ hard: 5, easy: 5 })
    const b = recordReviewEvent({ events: a, deckId: 'x', cardIndex: 999, card: { srs: { reps: 0, ease: 1.5, interval: 0, due: iso(-1), last: iso(-3) } }, rating: 'again', now }).events
    expect(fingerprint(a)).not.toBe(fingerprint(b))
  })
})

describe('ml/model + logistic regression', () => {
  it('trains deterministically (identical data -> identical weights)', () => {
    const { X, y } = buildTrainingData(makeEvents({ hard: 30, easy: 30 }))
    const m1 = train(X, y)
    const m2 = train(X, y)
    expect(m1.w).toEqual(m2.w)
    expect(m1.b).toBe(m2.b)
  })

  it('learns the signal: stale/fragile predicted higher than fresh/strong (bounded)', () => {
    const events = makeEvents({ hard: 30, easy: 30 })
    expect(canTrain(events)).toBe(true)
    const { model, meta } = getModel(events)
    expect(meta.available).toBe(true)
    const pHard = predict(model, extractFeatures({ card: { srs: { reps: 1, ease: 1.7, interval: 4, due: iso(-20), last: iso(-25) } }, priorEvents: [], now }).vector)
    const pEasy = predict(model, extractFeatures({ card: { srs: { reps: 5, ease: 2.6, interval: 20, due: iso(6), last: iso(-1) } }, priorEvents: [], now }).vector)
    expect(inUnit(pHard)).toBe(true)
    expect(inUnit(pEasy)).toBe(true)
    expect(pHard).toBeGreaterThan(pEasy)
  })

  it('caches by fingerprint (reuse) and retrains when data changes', () => {
    const events = makeEvents({ hard: 30, easy: 30 })
    const a = getModel(events)
    const b = getModel(events)
    expect(a.model).toBe(b.model) // same cached instance
    const more = recordReviewEvent({ events, deckId: 'x', cardIndex: 500, card: { srs: { reps: 0, ease: 1.5, interval: 0, due: iso(-2), last: iso(-4) } }, rating: 'again', now }).events
    const c = getModel(more)
    expect(c.model).not.toBe(a.model) // retrained on changed data
  })

  it('requires the training threshold + both classes (guards cold start)', () => {
    expect(canTrain(makeEvents({ hard: 3, easy: 2 }))).toBe(false) // below threshold
    expect(canTrain(makeEvents({ hard: 50, easy: 0 }))).toBe(false) // one class only
    expect(TRAINING_THRESHOLD).toBe(40)
  })
})

describe('ml/predictForgetting (public API)', () => {
  const deck = { id: 'd', topic: 'Bio', cards: [
    { question: 'a', srs: { reps: 1, ease: 1.6, interval: 3, due: iso(-6), last: iso(-12) } },
    { question: 'b', srs: { reps: 7, ease: 2.7, interval: 45, due: iso(20), last: iso(-1) } },
  ] }

  it('cold start: no model -> SRS fallback, still ranks every card with reasons', () => {
    const rep = predictForgetting({ sets: [deck], now, events: [] })
    expect(rep.available).toBe(false)
    expect(rep.cards).toHaveLength(2)
    expect(rep.cards.every((c) => c.source === 'srs')).toBe(true)
    expect(rep.cards.every((c) => inUnit(c.forgettingProbability) && inUnit(c.difficultyScore) && inUnit(c.confidence))).toBe(true)
    expect(rep.cards.every((c) => c.reasons.length > 0)).toBe(true)
  })

  it('with a trained model -> source ML, bounded probabilities', () => {
    const events = makeEvents({ hard: 30, easy: 30 })
    saveEvents(events)
    const rep = predictForgetting({ sets: [deck], now, events })
    expect(rep.available).toBe(true)
    expect(rep.cards.every((c) => c.source === 'model')).toBe(true)
    expect(rep.cards.every((c) => inUnit(c.forgettingProbability))).toBe(true)
  })
})
