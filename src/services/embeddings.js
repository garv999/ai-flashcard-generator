// Embedding provider abstraction for the retrieval (RAG) pipeline.
//
// Turns text into dense vectors, reusing the app's existing provider model:
//   - 'openai'    : real embeddings via text-embedding-3-small (key required).
//   - 'anthropic' : Anthropic has no embeddings endpoint, so it falls back to
//                   the local embedder below (offline, no extra key needed).
//   - 'demo'      : the local embedder — fully offline, no API key.
//
// The LOCAL EMBEDDER is a dependency-free "hashing trick" bag-of-words + bigram
// model projected into a fixed-dimension space and L2-normalised. It captures
// lexical overlap well enough for within-document semantic retrieval and makes
// Demo mode genuinely work without a network. All vectors are unit-normalised,
// so cosine similarity reduces to a dot product.
//
// OpenAI embeddings go through the same server-side proxy as the chat/generation
// calls (src/services/aiProxy.js) — the key is injected server-side and never
// reaches the browser.

import { callProvider } from './aiProxy.js'

export const LOCAL_DIM = 384
const OPENAI_MODEL = 'text-embedding-3-small'
const OPENAI_DIM = 1536
const OPENAI_BATCH = 64 // inputs per embeddings request

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'and', 'or', 'for', 'on', 'at', 'by', 'as', 'be',
  'it', 'its', 'this', 'that', 'these', 'those', 'was', 'were', 'are', 'with', 'from', 'has',
  'have', 'had', 'not', 'but', 'they', 'their', 'them', 'you', 'your', 'we', 'our',
])

// FNV-1a 32-bit hash of a string → unsigned int.
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function tokenize(text) {
  return (text || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 1) || []
}

function l2normalize(vec) {
  let norm = 0
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= norm
  }
  return vec
}

// Local hashing embedding: unigrams (full weight) + adjacent bigrams (half
// weight), hashed into LOCAL_DIM buckets with a signed contribution, then
// L2-normalised. Deterministic and offline.
export function localEmbed(text, dim = LOCAL_DIM) {
  const vec = new Array(dim).fill(0)
  const tokens = tokenize(text)
  const add = (term, weight) => {
    const h = fnv1a(term)
    const bucket = h % dim
    const sign = (h >>> 31) & 1 ? -1 : 1
    vec[bucket] += sign * weight
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (!STOP_WORDS.has(tok)) add(tok, 1)
    if (i + 1 < tokens.length) add(`${tok}_${tokens[i + 1]}`, 0.5) // bigram
  }
  return l2normalize(vec)
}

// Describe the embedder to use for a NEW index, given the current settings.
// The index stores this so its query is always embedded the same way later.
export function resolveEmbedder(settings) {
  const provider = settings?.provider || 'demo'
  if (provider === 'openai') {
    return { provider: 'openai', model: OPENAI_MODEL, dim: OPENAI_DIM, needsKey: true }
  }
  // Anthropic (no embeddings API) and Demo both use the offline local embedder.
  return { provider: 'local', model: 'hash-v1', dim: LOCAL_DIM, needsKey: false }
}

async function openaiEmbedBatch(inputs, signal) {
  const json = await callProvider('openai', 'embeddings', { model: OPENAI_MODEL, input: inputs }, { signal })
  // Keep provider order stable, then normalise so cosine == dot product.
  return (json.data || [])
    .sort((a, b) => a.index - b.index)
    .map((d) => l2normalize(d.embedding.slice()))
}

// Embed many texts with a resolved embedder. Returns number[][] (parallel to
// `texts`). onProgress({ current, total }) reports batch progress.
export async function embedTexts(texts, embedder, settings, { onProgress, signal } = {}) {
  const list = texts || []
  if (!list.length) return []

  if (embedder.provider === 'openai') {
    const out = []
    const batches = Math.ceil(list.length / OPENAI_BATCH)
    for (let b = 0; b < batches; b++) {
      const slice = list.slice(b * OPENAI_BATCH, (b + 1) * OPENAI_BATCH)
      const vecs = await openaiEmbedBatch(slice, signal)
      out.push(...vecs)
      if (onProgress) onProgress({ current: Math.min((b + 1) * OPENAI_BATCH, list.length), total: list.length })
    }
    return out
  }

  // Local embedder — synchronous and offline.
  const out = list.map((t) => localEmbed(t, embedder.dim))
  if (onProgress) onProgress({ current: list.length, total: list.length })
  return out
}

// Embed a single query with the SAME embedder the index was built with.
export async function embedQuery(text, embedder, settings, { signal } = {}) {
  const [vec] = await embedTexts([text], embedder, settings, { signal })
  return vec
}
