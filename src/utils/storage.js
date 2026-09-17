// Lightweight wrappers around localStorage for persisting flashcard sets
// and user settings. All data stays in the browser — no backend required.

const SETS_KEY = 'aifc.sets'
const SETTINGS_KEY = 'aifc.settings'

const DEFAULT_SETTINGS = {
  provider: 'demo', // 'demo' | 'gemini'
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
  // Guarantee an array even if aifc.sets was manually edited / corrupted to a
  // valid-but-non-array value (e.g. {} or null) — the app maps/filters over it.
  const parsed = safeParse(localStorage.getItem(SETS_KEY), [])
  return Array.isArray(parsed) ? parsed : []
}

export function saveSets(sets) {
  localStorage.setItem(SETS_KEY, JSON.stringify(sets))
}

// Remove locally-stored decks (used after migrating Demo data to Firestore).
export function clearSets() {
  localStorage.removeItem(SETS_KEY)
}

export function loadSettings() {
  // Strip any legacy apiKey that older builds may have persisted — provider keys
  // now live server-side and must never be kept in the browser.
  const { apiKey, ...saved } = safeParse(localStorage.getItem(SETTINGS_KEY), {})
  return { ...DEFAULT_SETTINGS, ...saved }
}

export function saveSettings(settings) {
  // Never persist an API key, even if one is somehow present on the object.
  const { apiKey, ...safe } = settings || {}
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(safe))
}

// Simple unique id without external dependencies.
export function makeId() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
