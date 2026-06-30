// Lightweight wrappers around localStorage for persisting flashcard sets
// and user settings. All data stays in the browser — no backend required.

const SETS_KEY = 'aifc.sets'
const SETTINGS_KEY = 'aifc.settings'

const DEFAULT_SETTINGS = {
  provider: 'demo', // 'demo' | 'openai' | 'anthropic'
  apiKey: '',
  cardCount: 10,
}

function safeParse(raw, fallback) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function loadSets() {
  return safeParse(localStorage.getItem(SETS_KEY), [])
}

export function saveSets(sets) {
  localStorage.setItem(SETS_KEY, JSON.stringify(sets))
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...safeParse(localStorage.getItem(SETTINGS_KEY), {}) }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// Simple unique id without external dependencies.
export function makeId() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
