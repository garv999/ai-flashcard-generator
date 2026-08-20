// Training-data store for the forgetting model.
//
// There is no per-card review history in the app's existing persistence — only
// each card's CURRENT SRS snapshot and daily aggregate analytics. So supervised
// training data is captured HERE, from real reviews as they happen: every time
// the learner rates a card, we log the feature vector computed from the card's
// state BEFORE the review, plus the outcome label (Again ⇒ forgotten). This is
// genuine user data, never fabricated, and it stays on-device (localStorage) —
// nothing is sent to any LLM or server.
//
// Responsibilities: feature/label capture (recordReviewEvent), persistence
// (load/save), per-card history lookup, training-matrix assembly, and a cheap
// fingerprint so the model only retrains when the data materially changes.

import { extractFeatures, FEATURE_KEYS } from './features.js'

const KEY = 'aifc.ml.events'
const MAX_EVENTS = 5000 // cap the log; oldest events fall off first

// ---- persistence -----------------------------------------------------------
export function loadEvents() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function saveEvents(events) {
  try {
    const trimmed = events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    /* quota / serialization — the in-session array still works */
  }
}

export function clearEvents() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// Prior events for one card (chronological), used to derive history features.
export function eventsForCard(events, deckId, cardIndex) {
  return events.filter((e) => e.deckId === deckId && e.cardIndex === cardIndex)
}

// Capture one real review as a labeled training example. `card` is the card as
// it was BEFORE scheduling (its pre-review SRS state); `rating` is the SM-2
// rating the learner gave. Returns the appended event. Best-effort and pure of
// side effects beyond the event log — it must never break the review flow.
export function recordReviewEvent({ events = loadEvents(), deckId, cardIndex, card, rating, now = Date.now() } = {}) {
  const label = rating === 'again' ? 1 : 0 // forgotten vs recalled
  const prior = eventsForCard(events, deckId, cardIndex)
  const { vector, named } = extractFeatures({ card, priorEvents: prior, now })
  const event = {
    id: `${deckId}:${cardIndex}:${now}`,
    deckId,
    cardIndex,
    at: now,
    rating,
    label,
    f: vector, // feature vector at review time (aligned to FEATURE_KEYS)
    named, // kept for inspection/debug; training uses `f`
  }
  const next = [...events, event]
  saveEvents(next)
  return { event, events: next }
}

// Assemble the training matrix from the event log. Each event already carries
// the feature vector captured at review time, so this is just a projection.
export function buildTrainingData(events) {
  const usable = events.filter((e) => Array.isArray(e.f) && e.f.length === FEATURE_KEYS.length && (e.label === 0 || e.label === 1))
  return {
    X: usable.map((e) => e.f),
    y: usable.map((e) => e.label),
    n: usable.length,
    positives: usable.reduce((s, e) => s + e.label, 0),
  }
}

// Cheap deterministic fingerprint of the dataset — changes only when the data
// materially changes (count + newest event id). Drives model-cache reuse so we
// don't retrain on every render.
export function fingerprint(events) {
  const n = events.length
  const last = n ? events[n - 1].id : 'none'
  const pos = events.reduce((s, e) => s + (e.label ? 1 : 0), 0)
  return `${n}:${pos}:${last}`
}
