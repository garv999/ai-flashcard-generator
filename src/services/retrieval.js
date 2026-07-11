// Retrieval layer (RAG) — the reusable semantic-search core.
//
// This module is the single place any AI feature goes to for "the most relevant
// passages of the source document". It composes the chunking + embedding
// services into an INDEX, stores it efficiently, and searches it by meaning:
//
//   raw text ──chunkText──▶ chunks ──embedTexts──▶ vectors ─┐
//                                                            ├─▶ index ─▶ store
//   query ──────────────────────────embedQuery──────────────┘         (search)
//
// Storage is deliberately compact: vectors are L2-normalised then quantised to
// int8 and packed as base64, so a full document index stays well under both the
// localStorage budget (Demo) and the 1 MB Firestore document limit (signed in).
//
// Future features should call retrieveForDeck() (or buildIndex + search) rather
// than re-implementing chunking, embeddings, or similarity themselves.

import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from './firebase'
import { chunkText } from './chunking.js'
import { resolveEmbedder, embedTexts, embedQuery } from './embeddings.js'

const INDEX_VERSION = 1
const RAG_KEY = 'aifc.rag' // Demo-mode localStorage bucket: { [deckId]: serialized }
const DEFAULT_TOP_K = 5
// Low noise floor: local-embedder cosine scores are modest (a strong match is
// ~0.1-0.3, a short query against a long chunk can be ~0.03), while truly
// off-topic passages sit at ≈0. This admits weak-but-real matches and rejects
// only near-orthogonal noise.
const MIN_SCORE = 0.02

// ---------- quantisation (compact storage) ----------

// Base64 <-> bytes, browser-safe.
function bytesToBase64(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
function base64ToBytes(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// Pack normalised vectors (components in [-1, 1]) into one int8 base64 blob.
function packVectors(vectors, dim) {
  const q = new Int8Array(vectors.length * dim)
  for (let r = 0; r < vectors.length; r++) {
    const v = vectors[r]
    for (let c = 0; c < dim; c++) {
      q[r * dim + c] = Math.max(-127, Math.min(127, Math.round((v[c] || 0) * 127)))
    }
  }
  return bytesToBase64(new Uint8Array(q.buffer))
}

// Unpack into an array of Float32Array rows (approximately unit length).
function unpackVectors(b64, count, dim) {
  const q = new Int8Array(base64ToBytes(b64).buffer)
  const rows = []
  for (let r = 0; r < count; r++) {
    const row = new Float32Array(dim)
    for (let c = 0; c < dim; c++) row[c] = q[r * dim + c] / 127
    rows.push(row)
  }
  return rows
}

// ---------- index build / (de)serialise ----------

// Build an in-memory index from raw document text. Returns null when there's no
// usable text. onProgress is forwarded from the embedding step.
export async function buildIndex(text, settings, { onProgress } = {}) {
  const chunks = chunkText(text)
  if (!chunks.length) return null
  const embedder = resolveEmbedder(settings)
  const vectors = await embedTexts(chunks.map((c) => c.text), embedder, settings, { onProgress })
  if (!vectors.length) return null
  return {
    version: INDEX_VERSION,
    embedder,
    createdAt: new Date().toISOString(),
    chunks, // [{ index, text }]
    vectors, // number[][], parallel to chunks
  }
}

// Compact form for persistence.
export function serializeIndex(index) {
  return {
    v: index.version,
    embedder: index.embedder,
    createdAt: index.createdAt,
    dim: index.embedder.dim,
    count: index.chunks.length,
    chunks: index.chunks.map((c) => c.text),
    vecs: packVectors(index.vectors, index.embedder.dim),
  }
}

export function deserializeIndex(data) {
  if (!data || !data.vecs || !data.count) return null
  const dim = data.dim || data.embedder?.dim
  return {
    version: data.v || INDEX_VERSION,
    embedder: data.embedder,
    createdAt: data.createdAt,
    chunks: (data.chunks || []).map((text, index) => ({ index, text })),
    vectors: unpackVectors(data.vecs, data.count, dim),
  }
}

// Small marker describing an index (attached to a deck for UI/awareness).
export function indexMarker(index) {
  return { count: index.chunks.length, dim: index.embedder.dim, provider: index.embedder.provider }
}

// ---------- similarity search ----------

// Dot product of two equal-length vectors (== cosine for unit vectors).
export function dot(a, b) {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

// Rank an index's chunks against a query vector. Returns
// [{ chunk, score }] sorted best-first, filtered by MIN_SCORE.
export function search(index, queryVector, topK = DEFAULT_TOP_K) {
  if (!index?.vectors?.length || !queryVector) return []
  return index.vectors
    .map((vec, i) => ({ chunk: index.chunks[i], score: dot(queryVector, vec) }))
    .filter((r) => r.score > MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

// Embed a query with the index's OWN embedder and search. Throws if the query
// can't be embedded (e.g. an OpenAI index but no key available now).
export async function retrieve(index, queryText, settings, { topK = DEFAULT_TOP_K } = {}) {
  if (!index || !queryText) return []
  const qvec = await embedQuery(queryText, index.embedder, settings)
  return search(index, qvec, topK)
}

// Render retrieved passages into a prompt-ready context block.
export function formatContext(results) {
  return results.map((r, i) => `[Excerpt ${i + 1}]\n${r.chunk.text}`).join('\n\n')
}

// ---------- persistence: localStorage (Demo) ----------

function loadLocalIndexes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RAG_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
function saveLocalIndex(deckId, serialized) {
  const all = loadLocalIndexes()
  all[deckId] = serialized
  try {
    localStorage.setItem(RAG_KEY, JSON.stringify(all))
  } catch {
    /* ignore quota errors — retrieval simply falls back to flashcards */
  }
}
function deleteLocalIndex(deckId) {
  const all = loadLocalIndexes()
  if (all[deckId]) {
    delete all[deckId]
    localStorage.setItem(RAG_KEY, JSON.stringify(all))
  }
}
export function loadAllLocalIndexes() {
  return loadLocalIndexes()
}
export function clearLocalIndexes() {
  localStorage.removeItem(RAG_KEY)
}

// ---------- persistence: Firestore (signed in) ----------
function indexDoc(uid, deckId) {
  return doc(db, 'users', uid, 'indexes', deckId)
}

// ---------- unified persistence API (keyed by deck) ----------

// Persist an index for a deck (Firestore when signed in, else localStorage).
export async function saveIndex({ deckId, user, index }) {
  const serialized = serializeIndex(index)
  if (user) return setDoc(indexDoc(user.uid, deckId), serialized)
  saveLocalIndex(deckId, serialized)
}

// Load a deck's index, or null if none / unreadable.
export async function loadIndex({ deckId, user }) {
  if (!deckId) return null
  try {
    if (user) {
      const snap = await getDoc(indexDoc(user.uid, deckId))
      return snap.exists() ? deserializeIndex(snap.data()) : null
    }
    return deserializeIndex(loadLocalIndexes()[deckId])
  } catch (e) {
    console.warn('[Flashcards] Failed to load retrieval index:', e?.message || e)
    return null
  }
}

export async function deleteIndex({ deckId, user }) {
  if (user) return deleteDoc(indexDoc(user.uid, deckId))
  deleteLocalIndex(deckId)
}

// One-time migration of Demo-mode indexes into Firestore after sign-in.
export async function migrateLocalIndexes(uid) {
  const all = loadLocalIndexes()
  const entries = Object.entries(all)
  if (!entries.length) return 0
  await Promise.all(entries.map(([deckId, serialized]) => setDoc(indexDoc(uid, deckId), serialized)))
  return entries.length
}

// ---------- high-level: build + persist, and retrieve ----------

// Build an index from document text and persist it for `deckId`. Returns a
// small marker ({ count, dim, provider }) to attach to the deck, or null.
export async function createAndSaveIndex({ deckId, text, settings, user, onProgress }) {
  const index = await buildIndex(text, settings, { onProgress })
  if (!index) return null
  await saveIndex({ deckId, user, index })
  return indexMarker(index)
}

// THE reusable entry point for AI features: fetch the most relevant passages of
// a deck's source document for a query. Best-effort — returns null (never
// throws) when there's no index or retrieval isn't possible, so callers can
// cleanly fall back to their existing context (e.g. flashcards).
export async function retrieveForDeck({ deck, deckId, user, query, settings, topK = DEFAULT_TOP_K }) {
  const id = deckId || deck?.id
  if (!id || !query) return null
  try {
    const index = await loadIndex({ deckId: id, user })
    if (!index?.chunks?.length) return null
    const results = await retrieve(index, query, settings, { topK })
    if (!results.length) return null
    return { results, text: formatContext(results) }
  } catch (e) {
    console.warn('[Flashcards] Retrieval unavailable, falling back:', e?.message || e)
    return null
  }
}
