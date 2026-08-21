// Evaluation event log — the ground truth for measuring the forgetting model.
//
// The evaluation is PREQUENTIAL (predict-then-observe), which makes it
// leakage-free by construction: at the moment a card is reviewed, we ask the
// model (as it exists right now, trained ONLY on prior reviews) for its
// prediction, then pair it with the actual outcome of THIS review — an outcome
// that occurs at/after the prediction and that the model has never seen. We also
// store the SRS estimate for the same card, so ML vs SRS is compared on
// identical outcomes.
//
// Records are appended at review time (App.handleRateCard, before the new
// training event is logged, so getModel sees prior events only). Everything is
// device-local, consistent with the existing ML event architecture.

import { loadEvents, eventsForCard } from '../dataset.js'
import { extractFeatures, srsDifficulty } from '../features.js'
import { getModel } from '../model.js'
import { predict } from '../logistic.js'

const KEY = 'aifc.ml.evalEvents'
const MAX = 5000
const round3 = (n) => Math.round(n * 1000) / 1000

export function loadEvalEvents() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function saveEvalEvents(events) {
  try {
    const trimmed = events.length > MAX ? events.slice(events.length - MAX) : events
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    /* quota — in-session data still available to the caller */
  }
}

export function clearEvalEvents() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// Record one leakage-free evaluation of the model for a card being reviewed.
//   { deckId, cardIndex, card, rating, now }
// `card` is the pre-review card (its features are the model's inputs); `rating`
// gives the actual outcome (Again ⇒ forgotten). MUST be called BEFORE the new
// training event is appended, so the model reflects only prior reviews.
// Returns the appended evaluation event (or null if it could not be built).
export function recordReviewEvaluation({ deckId, cardIndex, card, rating, now = Date.now() } = {}) {
  const priorAll = loadEvents() // events strictly before this review
  const prior = eventsForCard(priorAll, deckId, cardIndex)
  const { vector } = extractFeatures({ card, priorEvents: prior, now })

  const res = getModel(priorAll) // trained on prior events only → no leakage
  const hasModel = !!res.model
  const pModel = hasModel ? round3(predict(res.model, vector)) : null
  const pSrs = round3(srsDifficulty(card, now))
  const outcome = rating === 'again' ? 1 : 0 // 1 = forgotten

  const evt = {
    id: `${deckId}:${cardIndex}:${now}`,
    cardId: `${deckId}:${cardIndex}`,
    deckId,
    cardIndex,
    at: now,
    outcome,
    pModel, // model prediction at the time (null in cold start)
    pSrs, // SRS estimate for the same card
    source: hasModel ? 'ML' : 'SRS',
    modelVersion: hasModel ? res.model.version : null,
    fingerprint: hasModel ? res.model.fingerprint : null,
  }
  const next = [...loadEvalEvents(), evt]
  saveEvalEvents(next)
  return evt
}
