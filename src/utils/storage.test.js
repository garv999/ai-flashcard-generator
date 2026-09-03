import { describe, it, expect } from 'vitest'
import { loadSets, saveSets, loadSettings } from './storage.js'

describe('utils/storage — defensive persistence boundaries', () => {
  it('loadSets returns [] when nothing is stored', () => {
    expect(loadSets()).toEqual([])
  })

  it('loadSets round-trips a real array', () => {
    saveSets([{ id: 'a', topic: 'T', cards: [] }])
    expect(loadSets()).toEqual([{ id: 'a', topic: 'T', cards: [] }])
  })

  it('loadSets never returns a non-array from corrupted/edited storage', () => {
    // valid JSON but not an array (e.g. manually edited) -> must fall back to []
    localStorage.setItem('aifc.sets', '{}')
    expect(Array.isArray(loadSets())).toBe(true)
    expect(loadSets()).toEqual([])
    localStorage.setItem('aifc.sets', 'null')
    expect(loadSets()).toEqual([])
    localStorage.setItem('aifc.sets', '42')
    expect(loadSets()).toEqual([])
    // invalid JSON
    localStorage.setItem('aifc.sets', 'not json {')
    expect(loadSets()).toEqual([])
  })

  it('loadSettings merges defaults and strips any persisted apiKey', () => {
    localStorage.setItem('aifc.settings', JSON.stringify({ cardCount: 15, apiKey: 'secret' }))
    const s = loadSettings()
    expect(s.provider).toBe('demo') // default preserved
    expect(s.cardCount).toBe(15) // override applied
    expect(s.apiKey).toBeUndefined() // key never surfaced
  })
})
