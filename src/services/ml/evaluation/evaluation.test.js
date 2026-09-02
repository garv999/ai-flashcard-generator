import { describe, it, expect } from 'vitest'
import * as M from './metrics.js'
import { calibration } from './calibration.js'
import { compareMlVsSrs } from './comparison.js'
import * as O from './outcomes.js'
import { recordReviewEvaluation, loadEvalEvents } from './events.js'
import { evaluationReport } from './index.js'
import { recordReviewEvent, saveEvents, fingerprint, loadEvents } from '../dataset.js'

const DAY = 864e5
const now = 1_700_000_000_000
const iso = (d) => new Date(now + d * DAY).toISOString()
const recs = (arr) => arr.map(([p, y]) => ({ p, y }))

function seedTrainable() {
  let e = [], i = 0
  for (; i < 30; i++) e = recordReviewEvent({ events: e, deckId: 'x', cardIndex: i, card: { srs: { reps: 1, ease: 1.7, interval: 4, due: iso(-20), last: iso(-25) } }, rating: 'again', now }).events
  for (; i < 60; i++) e = recordReviewEvent({ events: e, deckId: 'x', cardIndex: i, card: { srs: { reps: 5, ease: 2.6, interval: 20, due: iso(6), last: iso(-1) } }, rating: 'good', now }).events
  saveEvents(e)
  return e
}

describe('evaluation/metrics', () => {
  it('perfect separation -> accuracy/precision/recall/F1/AUC = 1, Brier ~ 0', () => {
    const perfect = recs([...Array(15).fill([0.9, 1]), ...Array(15).fill([0.1, 0])])
    expect(M.accuracy(perfect)).toBe(1)
    expect(M.precision(perfect)).toBe(1)
    expect(M.recall(perfect)).toBe(1)
    expect(M.f1(perfect)).toBe(1)
    expect(M.rocAuc(perfect)).toBe(1)
    expect(M.prAuc(perfect)).toBe(1)
    expect(M.brier(perfect)).toBeLessThan(0.02)
    expect(M.confusion(perfect)).toEqual({ tp: 15, fp: 0, tn: 15, fn: 0 })
  })

  it('uninformative predictor (all p=0.5) -> ROC-AUC 0.5, Brier 0.25', () => {
    const flat = recs([...Array(15).fill([0.5, 1]), ...Array(15).fill([0.5, 0])])
    expect(M.rocAuc(flat)).toBe(0.5)
    expect(M.brier(flat)).toBe(0.25)
  })

  it('returns null (not a misleading number) below the minimum sample size', () => {
    expect(M.accuracy(recs(Array(10).fill([0.8, 1])))).toBeNull()
    expect(M.rocAuc(recs(Array(20).fill([0.8, 1])))).toBeNull() // < MIN.auc
  })

  it('single-class datasets -> AUC null, accuracy still defined', () => {
    const allNeg = recs(Array(30).fill([0.3, 0]))
    expect(M.rocAuc(recs(Array(30).fill([0.7, 1])))).toBeNull()
    expect(M.rocAuc(allNeg)).toBeNull()
    expect(M.accuracy(allNeg)).toBe(1)
  })
})

describe('evaluation/calibration', () => {
  it('reports predicted vs observed per bucket; hidden below CAL_MIN', () => {
    const data = recs([...Array(10).fill([0.1, 0]), ...Array(10).fill([0.7, 1]), ...Array(10).fill([0.7, 0])])
    const cal = calibration(data)
    expect(cal.available).toBe(true)
    const band = cal.buckets.find((b) => b.label === '60-80%')
    expect(band.count).toBe(20)
    expect(band.avgPredicted).toBe(0.7)
    expect(band.observedRate).toBe(0.5) // measured, not assumed
    expect(cal.ece).not.toBeNull()
    expect(calibration(recs(Array(10).fill([0.5, 1]))).available).toBe(false)
  })
})

describe('evaluation/events (leakage-free)', () => {
  it('predicts from the PRIOR-only model and never mutates the training log', () => {
    const prior = seedTrainable()
    const priorFp = fingerprint(prior)
    const evt = recordReviewEvaluation({ deckId: 'z', cardIndex: 0, card: { srs: { reps: 0, ease: 1.5, interval: 0, due: iso(-2), last: iso(-5) } }, rating: 'again', now: now + DAY })
    expect(evt.outcome).toBe(1) // outcome from the actual rating
    expect(evt.pModel).not.toBeNull()
    expect(evt.pSrs).not.toBeNull()
    expect(evt.fingerprint).toBe(priorFp) // model trained on prior events only -> no leakage
    expect(fingerprint(loadEvents())).toBe(priorFp) // training log untouched
  })

  it('tags predictions by fingerprint and preserves history across retrain', () => {
    const e1 = seedTrainable()
    const ev1 = recordReviewEvaluation({ deckId: 'z', cardIndex: 1, card: { srs: { reps: 0, ease: 1.5, interval: 0, due: iso(-2), last: iso(-5) } }, rating: 'again', now: now + DAY })
    let e2 = e1
    for (let k = 0; k < 6; k++) e2 = recordReviewEvent({ events: e2, deckId: 'x', cardIndex: 100 + k, card: { srs: { reps: 2, ease: 2.0, interval: 6, due: iso(-1), last: iso(-4) } }, rating: k % 2 ? 'good' : 'again', now }).events
    saveEvents(e2)
    const ev2 = recordReviewEvaluation({ deckId: 'z', cardIndex: 2, card: { srs: { reps: 0, ease: 1.5, interval: 0, due: iso(-2), last: iso(-5) } }, rating: 'good', now: now + 2 * DAY })
    expect(ev2.fingerprint).not.toBe(ev1.fingerprint)
    expect(loadEvalEvents()).toHaveLength(2)
  })
})

describe('evaluation/ML vs SRS', () => {
  it('compares ML and SRS on identical outcomes; gated; no fabricated %', () => {
    const evEvents = []
    for (let i = 0; i < 40; i++) {
      const y = i % 2
      evEvents.push({ id: 'e' + i, cardId: 'd:' + i, deckId: 'd', cardIndex: i, at: now + i, outcome: y, pModel: y ? 0.8 : 0.2, pSrs: 0.5, source: 'ML', modelVersion: 1, fingerprint: 'fp' })
    }
    const cmp = compareMlVsSrs(evEvents)
    expect(cmp.available).toBe(true)
    expect(cmp.ml.rocAuc).toBeGreaterThan(cmp.srs.rocAuc)
    expect(cmp.delta.rocAuc).toBeGreaterThan(0)
    const few = compareMlVsSrs(evEvents.slice(0, 5))
    expect(few.available).toBe(false)
    expect(few.message).toMatch(/unavailable until sufficient/i)
  })
})

describe('evaluation/recommendation outcomes (observational)', () => {
  it('attributes only post-acceptance reviews, at most once per card', () => {
    O.recordRecommendationImpression({ surface: 'plan', deckId: 'd', now })
    const rec = { cards: [
      { deckId: 'd', cardIndex: 0, type: 'high-risk', score: 0.8, source: 'ML', forgettingProbability: 0.75 },
      { deckId: 'd', cardIndex: 1, type: 'due-for-review', score: 0.6, source: 'ML', forgettingProbability: 0.4 },
    ] }
    O.recordRecommendationAccepted({ recommendation: rec, surface: 'plan', deckId: 'd', now })
    expect(O.attributeRecommendationOutcome({ deckId: 'd', cardIndex: 0, rating: 'good', now: now - DAY })).toBe(false) // pre-acceptance
    expect(O.attributeRecommendationOutcome({ deckId: 'd', cardIndex: 0, rating: 'good', now: now + DAY })).toBe(true)
    expect(O.attributeRecommendationOutcome({ deckId: 'd', cardIndex: 0, rating: 'again', now: now + 2 * DAY })).toBe(false) // single-match
  })

  it('computes observed success/lapse by type; hidden below REC_MIN', () => {
    const cards = []
    for (let i = 0; i < 20; i++) cards.push({ deckId: 'd', cardIndex: i, type: i < 10 ? 'high-risk' : 'due-for-review', score: 0.7, source: 'ML', forgettingProbability: i < 10 ? 0.7 : 0.3 })
    O.recordRecommendationImpression({ surface: 'analytics', deckId: 'd', now })
    O.recordRecommendationAccepted({ recommendation: { cards }, surface: 'analytics', deckId: 'd', now })
    for (let i = 0; i < 20; i++) O.attributeRecommendationOutcome({ deckId: 'd', cardIndex: i, rating: i < 15 ? 'good' : 'again', now: now + DAY })
    const rm = O.recommendationMetrics({ now: now + 2 * DAY })
    expect(rm.available).toBe(true)
    expect(rm.studiedCards).toBe(20)
    expect(rm.observedLapseRate).toBe(0.25)
    expect(rm.observedSuccessRate).toBe(0.75)
    expect(rm.byType['high-risk']).toBeTruthy()
    // fresh state (nothing recorded) -> gated
    O.clearRecOutcomes()
    expect(O.recommendationMetrics({ now }).available).toBe(false)
  })
})

describe('evaluation/report', () => {
  it('empty dataset -> every section unavailable, dataState=no-data (0 vs N/A)', () => {
    const empty = evaluationReport({ now })
    expect(empty.dataState).toBe('no-data')
    expect(empty.modelPerformance.available).toBe(false)
    expect(empty.calibration.available).toBe(false)
    expect(empty.mlVsSrs.available).toBe(false)
    expect(empty.recommendations.available).toBe(false)
    expect(empty.coverage.evaluatedPredictions).toBe(0)
  })
})
