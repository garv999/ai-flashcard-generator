import { describe, it, expect } from 'vitest'
import { schedule, isDue, isNew, getDueIndices, deckDueCount, RATINGS } from './srs.js'
import { buildQuiz, canQuiz, needsAiDistractors, foldQuizResult, isNewBest } from './quiz.js'

const now = 1_700_000_000_000
const DAY = 864e5
const iso = (d) => new Date(now + d * DAY).toISOString()

describe('srs (SM-2 scheduling)', () => {
  it('exposes the four ratings', () => {
    expect(RATINGS.map((r) => r.key)).toEqual(['again', 'hard', 'good', 'easy'])
  })

  it('schedules a "good" review deterministically (reps 1 -> 2, interval 1 -> 6)', () => {
    const s = schedule({ srs: { reps: 1, ease: 2.5, interval: 1 } }, 'good', now)
    expect(s.reps).toBe(2)
    expect(s.interval).toBe(6)
    expect(typeof s.due).toBe('string')
    expect(typeof s.last).toBe('string')
  })

  it('"again" resets reps to 0 and lowers ease', () => {
    const s = schedule({ srs: { reps: 3, ease: 2.5, interval: 10 } }, 'again', now)
    expect(s.reps).toBe(0)
    expect(s.ease).toBeLessThan(2.5)
    expect(s.interval).toBe(0)
  })

  it('classifies new / due cards and counts due indices', () => {
    expect(isNew({})).toBe(true)
    expect(isNew({ srs: { due: iso(1) } })).toBe(false)
    expect(isDue({}, now)).toBe(true) // never scheduled -> due
    expect(isDue({ srs: { due: iso(-1) } }, now)).toBe(true)
    expect(isDue({ srs: { due: iso(5) } }, now)).toBe(false)
    const set = { cards: [{}, { srs: { due: iso(-1) } }, { srs: { due: iso(5) } }] }
    expect(getDueIndices(set, now)).toEqual([0, 1])
    expect(deckDueCount(set, now)).toBe(2)
  })
})

describe('quiz (multiple-choice engine)', () => {
  const deck = { id: 'd', topic: 'Bio', cards: [
    { question: 'What is a cell?', answer: 'The basic unit of life.' },
    { question: 'What is DNA?', answer: 'Genetic material.' },
    { question: 'What is a ribosome?', answer: 'Site of protein synthesis.' },
    { question: 'What is mitosis?', answer: 'Cell division.' },
  ] }

  it('builds valid MCQs (correct option present, indices in range)', () => {
    const qs = buildQuiz(deck)
    expect(qs.length).toBeGreaterThan(0)
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
      expect(q.correctIndex).toBeGreaterThanOrEqual(0)
      expect(q.options[q.correctIndex]).toBe(q.answer)
    }
  })

  it('canQuiz needs >= 2 distinct answers', () => {
    expect(canQuiz(deck)).toBe(true)
    expect(canQuiz({ cards: [{ question: 'q', answer: 'a' }] })).toBe(false)
    expect(canQuiz({ cards: [] })).toBe(false)
  })

  it('needsAiDistractors is true only for a thin distinct-answer pool', () => {
    expect(needsAiDistractors({ cards: [{ answer: 'a' }, { answer: 'b' }] })).toBe(true) // 2 distinct < 4
    expect(needsAiDistractors(deck)).toBe(false) // 4 distinct answers
  })

  it('folds quiz results keeping best + last, detects a new best', () => {
    let rec = foldQuizResult(null, { pct: 50 })
    expect(rec.best.pct).toBe(50)
    rec = foldQuizResult(rec, { pct: 70 })
    expect(rec.best.pct).toBe(70)
    rec = foldQuizResult(rec, { pct: 60 })
    expect(rec.best.pct).toBe(70)
    expect(rec.last.pct).toBe(60)
    expect(isNewBest({ best: { pct: 70 } }, { pct: 60 })).toBe(false)
    expect(isNewBest(null, { pct: 10 })).toBe(true)
  })
})
