// Semantic search over flashcards, built on the app's existing embedding stack.
//
// Reuses resolveEmbedder / embedTexts / embedQuery (embeddings.js) and the
// L2-normalised-vector convention (so cosine similarity == dot product). This
// module adds:
//   - a per-card embedding cache keyed by content hash + embedder model, so a
//     card is only embedded once and only re-embedded when its text changes;
//   - incremental indexing (new/changed cards embed; unchanged cards hit cache);
//   - ranking of decks by their best-matching card via cosine similarity.
//
// Works for Demo mode (offline local hashing embedder) and signed-in users
// (same embedder resolution). With the Gemini provider it uses real
// gemini-embedding-001 vectors; otherwise it falls back to the local embedder.
// Vectors are cached under the embedder model, so Gemini and local vectors are
// never mixed. It never throws to the UI — on any failure the caller falls back
// to keyword search.
import { resolveEmbedder, embedTexts, embedQuery } from './embeddings.js'
import { dot } from './retrieval.js'

const CACHE_PREFIX = 'aifc.cardvec.' // + embedder model
// A modest floor so near-orthogonal (irrelevant) cards are dropped. The local
// hashing embedder produces smaller scores than OpenAI, hence a lower floor.
const MIN_SCORE = { gemini: 0.28, local: 0.12 }

// ---- content hashing (FNV-1a 32-bit) -----------------------------------
function hashText(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(36)
}
const cardText = (c) => `${c?.question || ''}\n${c?.answer || ''}`
const cardHash = (c) => hashText(cardText(c))

// ---- compact vector (de)serialisation: Float32 <-> base64 --------------
function encodeVec(vec) {
  const f = new Float32Array(vec)
  let bin = ''
  const bytes = new Uint8Array(f.buffer)
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function decodeVec(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

// ---- cache (in-memory session + guarded localStorage) ------------------
const mem = new Map() // model -> { [hash]: Float32Array }

function getStore(model) {
  if (mem.has(model)) return mem.get(model)
  let raw = {}
  try {
    raw = JSON.parse(localStorage.getItem(CACHE_PREFIX + model) || '{}')
  } catch {
    raw = {}
  }
  const store = {}
  for (const [h, b64] of Object.entries(raw)) {
    try {
      store[h] = decodeVec(b64)
    } catch {
      /* skip corrupt entry */
    }
  }
  mem.set(model, store)
  return store
}

function persist(model, store) {
  // Best-effort. localStorage can throw QuotaExceededError for large libraries;
  // the in-memory cache still serves the session, so we degrade silently.
  try {
    const out = {}
    for (const [h, v] of Object.entries(store)) out[h] = encodeVec(v)
    localStorage.setItem(CACHE_PREFIX + model, JSON.stringify(out))
  } catch {
    /* quota or serialisation issue — keep session cache only */
  }
}

// Describes the current semantic capability. Always "available" because there is
// a local-embedder floor; `real` is true only when true embeddings are in use.
export function semanticInfo(settings) {
  const e = resolveEmbedder(settings)
  return { available: true, kind: e.provider, real: e.provider === 'gemini' }
}

// Flatten every card across all decks into an indexable list.
function collectCards(sets) {
  const out = []
  for (const s of sets || []) {
    ;(s.cards || []).forEach((c, i) => {
      out.push({ deckId: s.id, topic: s.topic, cardIndex: i, question: c.question, answer: c.answer, hash: cardHash(c) })
    })
  }
  return out
}

// Ensure every card has an embedding, embedding only the ones not already
// cached for this embedder. Returns the card list with a `vector` on each.
// Never throws: on an embedding error the affected cards are simply omitted.
export async function indexCards(sets, settings, { signal, onProgress } = {}) {
  const embedder = resolveEmbedder(settings)
  const store = getStore(embedder.model)
  const cards = collectCards(sets)

  const missing = cards.filter((c) => !store[c.hash])
  if (missing.length) {
    // De-duplicate identical texts so we embed each unique card once.
    const uniq = [...new Map(missing.map((c) => [c.hash, c])).values()]
    try {
      const vecs = await embedTexts(uniq.map(cardText), embedder, settings, { signal, onProgress })
      uniq.forEach((c, i) => {
        if (vecs[i]) store[c.hash] = Float32Array.from(vecs[i])
      })
      persist(embedder.model, store)
    } catch {
      /* leave un-embedded cards out of the index; caller can fall back */
    }
  }

  return cards.map((c) => ({ ...c, vector: store[c.hash] })).filter((c) => c.vector)
}

// Rank cards by cosine similarity to the query. Returns best-first, filtered by
// the embedder's noise floor.
export async function searchCards(query, sets, settings, { signal, topK = 50 } = {}) {
  const q = (query || '').trim()
  if (!q) return []
  const embedder = resolveEmbedder(settings)
  const indexed = await indexCards(sets, settings, { signal })
  if (!indexed.length) return []

  const qvec = await embedQuery(q, embedder, settings, { signal })
  if (!qvec) return []

  const floor = MIN_SCORE[embedder.provider] ?? 0.12
  return indexed
    .map((c) => ({ ...c, score: dot(qvec, c.vector) }))
    .filter((c) => c.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// Rank DECKS by their best-matching card, for the existing deck-grid UI.
// Returns an ordered array of deck ids (best first), or null when there is no
// query. Throwing is impossible — the caller uses this or falls back to keyword.
export async function rankDeckIds(query, sets, settings, { signal } = {}) {
  const matches = await searchCards(query, sets, settings, { signal, topK: 200 })
  const best = new Map()
  for (const m of matches) {
    if (!best.has(m.deckId) || m.score > best.get(m.deckId)) best.set(m.deckId, m.score)
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}
