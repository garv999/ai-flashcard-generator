import { describe, it, expect } from 'vitest'
import { buildBlueprint, generateExam, gradeExam, foldExamResult, isNewBestExam, buildExam, riskBand } from './index.js'
import { recordReviewEvent, saveEvents } from '../ml/dataset.js'
import { buildIndex, saveIndex } from '../retrieval.js'

const DAY = 864e5
const now = 1_700_000_000_000
const iso = (d) => new Date(now + d * DAY).toISOString()
const demo = { provider: 'demo' }

function makeDeck(id = 'd') {
  return { id, topic: 'Radio', cards: [
    { question: 'Fragile overdue concept?', answer: 'Alpha answer', srs: { reps: 0, ease: 1.4, interval: 0, due: iso(-5), last: iso(-9) } },
    { question: 'Mastered fresh concept?', answer: 'Bravo answer', srs: { reps: 6, ease: 2.7, interval: 40, due: iso(20), last: iso(-1) } },
    { question: 'Middling concept C?', answer: 'Charlie answer', srs: { reps: 2, ease: 2.1, interval: 6, due: iso(-1), last: iso(-6) } },
    { question: 'Concept D?', answer: 'Delta answer' },
    { question: 'Concept E?', answer: 'Echo answer' },
    { question: 'Concept F?', answer: 'Foxtrot answer' },
    { question: 'Concept G?', answer: 'Golf answer' },
    { question: 'Concept H?', answer: 'Hotel answer' },
  ] }
}

describe('exam/blueprint', () => {
  it('riskBand bands probabilities', () => {
    expect(riskBand(0.8)).toBe('high')
    expect(riskBand(0.4)).toBe('medium')
    expect(riskBand(0.1)).toBe('low')
  })

  it('weak-focus selects the fragile/overdue card first; SRS source in cold start', () => {
    const bp = buildBlueprint({ deck: makeDeck(), length: 3, focusWeak: true, now })
    expect(bp.items).toHaveLength(3)
    expect(bp.items[0].cardIndex).toBe(0)
    expect(bp.source).toBe('SRS')
    expect(bp.items.every((i) => ['high', 'medium', 'low'].includes(i.band))).toBe(true)
  })

  it('balanced coverage stratifies across the deck (not clustered)', () => {
    const bp = buildBlueprint({ deck: makeDeck(), length: 4, focusWeak: false, now })
    expect(bp.items.map((i) => i.cardIndex).sort((a, b) => a - b)).toEqual([0, 2, 4, 6])
  })

  it('clamps length to eligible cards and filters answer-less cards', () => {
    const deck = makeDeck()
    deck.cards.push({ question: 'No answer card' }) // ineligible
    const bp = buildBlueprint({ deck, length: 50, focusWeak: true, now })
    expect(bp.eligibleCount).toBe(8)
    expect(bp.actual).toBe(8)
    expect(bp.requested).toBe(50)
  })

  it('labels ML source once a model is trained', () => {
    let e = [], i = 0
    for (; i < 30; i++) e = recordReviewEvent({ events: e, deckId: 'x', cardIndex: i, card: { srs: { reps: 1, ease: 1.7, interval: 4, due: iso(-20), last: iso(-25) } }, rating: 'again', now }).events
    for (; i < 60; i++) e = recordReviewEvent({ events: e, deckId: 'x', cardIndex: i, card: { srs: { reps: 5, ease: 2.6, interval: 20, due: iso(6), last: iso(-1) } }, rating: 'good', now }).events
    saveEvents(e)
    const bp = buildBlueprint({ deck: makeDeck(), length: 3, focusWeak: true, now })
    expect(bp.source).toBe('ML')
    expect(bp.items.every((it) => it.source === 'ML')).toBe(true)
  })

  it('refuses a deck too small to quiz', () => {
    const bp = buildBlueprint({ deck: { id: 'z', topic: 'Tiny', cards: [{ question: 'Q', answer: 'A' }] }, length: 5, now })
    expect(bp.canBuild).toBe(false)
  })
})

describe('exam/grade', () => {
  it('scores + risk-band breakdown + predicted-vs-observed + missed', () => {
    const blueprint = { source: 'ML', items: [
      { cardIndex: 0, band: 'high', riskProb: 0.8, source: 'ML' },
      { cardIndex: 1, band: 'high', riskProb: 0.7, source: 'ML' },
      { cardIndex: 2, band: 'low', riskProb: 0.2, source: 'ML' },
    ] }
    const records = [
      { cardIndex: 0, correct: false },
      { cardIndex: 1, correct: true },
      { cardIndex: 2, correct: true },
    ]
    const g = gradeExam({ blueprint, records })
    expect(g.pct).toBe(67)
    expect(g.correct).toBe(2)
    expect(g.bands.high).toEqual({ correct: 1, total: 2 })
    expect(g.bands.low).toEqual({ correct: 1, total: 1 })
    expect(g.weakAccuracy).toBe(50)
    expect(g.restAccuracy).toBe(100)
    expect(g.missedCardIndices).toEqual([0])
    expect(g.predictedVsObserved).toHaveLength(3)
  })

  it('handles an empty exam without error', () => {
    const g = gradeExam({ blueprint: { items: [] }, records: [] })
    expect(g.pct).toBe(0)
    expect(g.missedCardIndices).toEqual([])
  })
})

describe('exam/persist', () => {
  it('folds best/last and detects a new best', () => {
    let rec = foldExamResult(null, { pct: 60 })
    expect(rec.best.pct).toBe(60)
    rec = foldExamResult(rec, { pct: 80 })
    expect(rec.best.pct).toBe(80)
    rec = foldExamResult(rec, { pct: 70 })
    expect(rec.best.pct).toBe(80) // best retained
    expect(rec.last.pct).toBe(70) // last updated
    expect(isNewBestExam({ best: { pct: 80 } }, { pct: 70 })).toBe(false)
    expect(isNewBestExam(null, { pct: 1 })).toBe(true)
  })
})

describe('exam/generate (offline)', () => {
  it('topic deck: questions match the blueprint, valid MCQs, not grounded', async () => {
    const deck = makeDeck()
    const bp = buildBlueprint({ deck, length: 5, focusWeak: true, now })
    const gen = await generateExam({ deck, blueprint: bp, settings: demo, user: null })
    expect(gen.grounded).toBe(false)
    expect(gen.questions).toHaveLength(bp.actual)
    expect(gen.questions.map((q) => q.cardIndex).sort((a, b) => a - b)).toEqual(bp.items.map((i) => i.cardIndex).sort((a, b) => a - b))
    expect(gen.questions.every((q) => q.examMeta && ['high', 'medium', 'low'].includes(q.examMeta.band))).toBe(true)
    expect(gen.questions.every((q) => q.options.length >= 2 && q.correctIndex >= 0 && q.options[q.correctIndex] === q.answer)).toBe(true)
  })

  it('PDF deck: grounded with page citations (offline index)', async () => {
    const pages = [
      { page: 1, text: 'Introduction to radio alphabets. Alpha is the first code word used for the letter A in aviation.' },
      { page: 7, text: '2.3 The word Bravo denotes the letter B and Charlie denotes the letter C in the NATO phonetic alphabet.' },
    ]
    const idx = await buildIndex(null, demo, { pages })
    await saveIndex({ deckId: 'pdfd', user: null, index: idx })
    const deck = { id: 'pdfd', topic: 'Radio', source: 'pdf', rag: { count: idx.chunks.length }, cards: [
      { question: 'What word denotes the letter A?', answer: 'Alpha' },
      { question: 'What word denotes the letter B?', answer: 'Bravo' },
      { question: 'What word denotes the letter C?', answer: 'Charlie' },
    ] }
    const bp = buildBlueprint({ deck, length: 3, focusWeak: false, now })
    const gen = await generateExam({ deck, blueprint: bp, settings: demo, user: null })
    expect(gen.grounded).toBe(true)
    const cited = gen.questions.filter((q) => q.examMeta?.sources?.kind === 'document' && q.examMeta.sources.items?.some((s) => s.page != null))
    expect(cited.length).toBeGreaterThan(0)
  })

  it('buildExam one-shot returns blueprint + questions', async () => {
    const out = await buildExam({ deck: makeDeck(), length: 4, focusWeak: true, settings: demo, user: null, now })
    expect(out.blueprint).toBeTruthy()
    expect(out.questions).toHaveLength(out.blueprint.actual)
  })
})
