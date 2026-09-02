import { describe, it, expect } from 'vitest'
import { detectIntent, MODES } from './intent.js'
import { askTutor } from './index.js'

const DAY = 864e5
const now = Date.now()
const iso = (d) => new Date(now + d * DAY).toISOString()
const demo = { provider: 'demo' }

describe('tutor/intent detection', () => {
  it('maps free-typed questions to the right mode', () => {
    expect(detectIntent('Explain how mitosis works').mode).toBe('EXPLAIN')
    expect(detectIntent('Give me a practice question').mode).toBe('PRACTICE')
    expect(detectIntent('give me a hint without the answer').mode).toBe('HINT')
    expect(detectIntent('why did I get this wrong?').mode).toBe('MISCONCEPTION')
    expect(detectIntent('what should I study next?').mode).toBe('RECOMMEND')
  })

  it('an explicit UI mode always wins over the question text', () => {
    expect(detectIntent('anything at all', 'HINT').mode).toBe('HINT')
    expect(detectIntent('explain this', 'PRACTICE').mode).toBe('PRACTICE')
  })

  it('returns a known mode + intent + style shape', () => {
    const d = detectIntent('summarize this topic')
    expect(MODES).toContain(d.mode)
    expect(typeof d.intent).toBe('string')
    expect(typeof d.style).toBe('string')
  })
})

describe('tutor/askTutor orchestration (demo, offline)', () => {
  const sets = [
    { id: 'a', topic: 'Physics', cards: [
      { question: 'What is inertia?', answer: 'Resistance to change in motion.', srs: { reps: 0, ease: 1.5, interval: 0, due: iso(-3), last: iso(-6) } },
      { question: 'What is momentum?', answer: 'Mass times velocity.', srs: { reps: 4, ease: 2.5, interval: 20, due: iso(10), last: iso(-2) } },
    ] },
    { id: 'b', topic: 'History', cards: [{ question: 'When was 1789?', answer: 'French Revolution.' }] },
  ]

  it('routes "what should I study?" to RECOMMEND and explains the ranked engine output', async () => {
    const r = await askTutor({ question: 'What should I study next?', mode: 'AUTO', deck: sets[0], sets, settings: demo })
    expect(r.mode).toBe('RECOMMEND')
    expect(r.text.length).toBeGreaterThan(0)
    expect(r.text).toMatch(/study next|ranked|priority|risk|due/i)
  })

  it('EXPLAIN mode returns a grounded-or-flashcard answer for a topic deck', async () => {
    const r = await askTutor({ question: 'Explain inertia', mode: 'EXPLAIN', deck: sets[0], sets, settings: demo })
    expect(r.mode).toBe('EXPLAIN')
    expect(r.text.length).toBeGreaterThan(0)
    expect(r.grounded).toBe(false) // topic deck, no PDF index
  })

  it('throws on an empty question', async () => {
    await expect(askTutor({ question: '   ', mode: 'AUTO', deck: sets[0], sets, settings: demo })).rejects.toThrow()
  })
})
