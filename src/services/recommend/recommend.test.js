import { describe, it, expect } from 'vitest'
import { recommendNext, recommendationContextText } from './index.js'
import { WEIGHTS } from './score.js'
import { recordReviewEvent, saveEvents } from '../ml/dataset.js'

const DAY = 864e5
const now = 1_700_000_000_000
const iso = (d) => new Date(now + d * DAY).toISOString()
const inUnit = (v) => typeof v === 'number' && v >= 0 && v <= 1

function trainedEvents() {
  let e = [], i = 0
  for (; i < 30; i++) e = recordReviewEvent({ events: e, deckId: 'x', cardIndex: i, card: { srs: { reps: 1, ease: 1.7, interval: 4, due: iso(-20), last: iso(-25) } }, rating: 'again', now }).events
  for (; i < 60; i++) e = recordReviewEvent({ events: e, deckId: 'x', cardIndex: i, card: { srs: { reps: 5, ease: 2.6, interval: 20, due: iso(6), last: iso(-1) } }, rating: 'good', now }).events
  saveEvents(e)
  return e
}

describe('recommend/score', () => {
  it('documented weights sum to 1', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 5)
  })
})

describe('recommend/recommendNext', () => {
  it('ranks a due card above a not-due card', () => {
    const deck = { id: 'd', topic: 'T', cards: [
      { question: 'due card', srs: { reps: 2, ease: 2.2, interval: 5, due: iso(-1), last: iso(-6) } },
      { question: 'not due', srs: { reps: 4, ease: 2.5, interval: 30, due: iso(15), last: iso(-2) } },
    ] }
    const rec = recommendNext({ sets: [deck], now })
    expect(rec.cards[0].cardIndex).toBe(0)
    expect(rec.cards[0].due).toBe(true)
  })

  it('ranks a fragile/overdue card first and gives every rec a typed reason', () => {
    const deck = { id: 'd', topic: 'T', cards: [
      { question: 'fragile overdue', srs: { reps: 0, ease: 1.4, interval: 0, due: iso(-4), last: iso(-9) } },
      { question: 'solid fresh', srs: { reps: 6, ease: 2.7, interval: 40, due: iso(20), last: iso(-1) } },
    ] }
    const rec = recommendNext({ sets: [deck], now })
    expect(rec.cards[0].cardIndex).toBe(0)
    expect(rec.cards.every((c) => c.reason && c.type && c.typeLabel)).toBe(true)
    expect(rec.cards.every((c) => inUnit(c.score) && inUnit(c.forgettingProbability))).toBe(true)
  })

  it('labels source SRS in cold start and ML once a model is trained', () => {
    const deck = { id: 'x', topic: 'Trained', cards: [{ question: 'a', srs: { reps: 1, ease: 1.7, interval: 4, due: iso(-3), last: iso(-8) } }] }
    const cold = recommendNext({ sets: [deck], now })
    expect(cold.source).toBe('SRS')
    expect(cold.cards.every((c) => c.source === 'SRS')).toBe(true)

    trainedEvents()
    const withMl = recommendNext({ sets: [deck], now })
    expect(withMl.source).toBe('ML')
    expect(withMl.cards.every((c) => c.source === 'ML')).toBe(true)
  })

  it('aggregates to topic level with priority + real counts', () => {
    const sets = [
      { id: 'phys', topic: 'Physics', cards: [
        { question: 'p1', srs: { reps: 0, ease: 1.4, interval: 0, due: iso(-3), last: iso(-8) } },
        { question: 'p2', srs: { reps: 1, ease: 1.6, interval: 1, due: iso(-2), last: iso(-5) } },
      ] },
      { id: 'hist', topic: 'History', cards: [
        { question: 'h1', srs: { reps: 5, ease: 2.6, interval: 30, due: iso(20), last: iso(-1) } },
      ] },
    ]
    const rec = recommendNext({ sets, now })
    expect(rec.topics).toHaveLength(2)
    const phys = rec.topics.find((t) => t.topic === 'Physics')
    const hist = rec.topics.find((t) => t.topic === 'History')
    expect(phys.avgScore).toBeGreaterThanOrEqual(hist.avgScore)
    expect(['high', 'medium', 'low']).toContain(phys.priority)
    expect(Number.isInteger(phys.weakCards)).toBe(true)
    expect(Number.isInteger(phys.dueCards)).toBe(true)
    expect(inUnit(phys.avgForgetting)).toBe(true)
  })

  it('is deterministic and independent of input card order', () => {
    const cards = [
      { question: 'a', srs: { reps: 0, ease: 1.4, interval: 0, due: iso(-4), last: iso(-9) } },
      { question: 'b', srs: { reps: 3, ease: 2.3, interval: 8, due: iso(-1), last: iso(-6) } },
      { question: 'c', srs: { reps: 6, ease: 2.7, interval: 40, due: iso(20), last: iso(-1) } },
    ]
    const r1 = recommendNext({ sets: [{ id: 'd', topic: 'T', cards }], now })
    const r2 = recommendNext({ sets: [{ id: 'd', topic: 'T', cards: [...cards].reverse() }], now })
    expect(r1.cards.map((c) => c.question)).toEqual(r2.cards.map((c) => c.question))
    const r1b = recommendNext({ sets: [{ id: 'd', topic: 'T', cards }], now })
    expect(r1b.cards.map((c) => c.cardIndex)).toEqual(r1.cards.map((c) => c.cardIndex))
  })

  it('cold-start brand-new deck: new cards recommendable, tutor context text produced', () => {
    const deck = { id: 'd', topic: 'Fresh', cards: [{ question: 'brand new 1' }, { question: 'brand new 2' }] }
    const rec = recommendNext({ sets: [deck], now })
    expect(rec.source).toBe('SRS')
    expect(rec.cards).toHaveLength(2)
    expect(rec.cards.every((c) => c.reason && inUnit(c.score))).toBe(true)
    const ctx = recommendationContextText(rec)
    expect(typeof ctx).toBe('string')
    expect(ctx).toMatch(/RANKED RECOMMENDATIONS/)
  })

  it('empty library yields an empty, non-throwing result', () => {
    const rec = recommendNext({ sets: [], now })
    expect(rec.cards).toHaveLength(0)
    expect(rec.topics).toHaveLength(0)
  })
})
