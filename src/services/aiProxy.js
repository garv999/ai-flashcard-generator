// Client wrapper for the server-side AI proxy (`/api/ai`).
//
// The browser never calls OpenAI / Anthropic directly and never holds a provider
// key — it posts the request body to our own endpoint, which injects the key
// server-side (see api/ai.js). This module is the single place the client talks
// to that proxy. Demo mode doesn't use it.

const ENDPOINT = '/api/ai'

function labelFor(provider) {
  return provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : 'AI'
}

// Send a provider request through the proxy. `path` is 'chat' | 'embeddings';
// `body` is the exact JSON the provider API expects (model, messages, …) minus
// any auth — the server adds that. Pass `signal` (an AbortSignal) to cancel the
// request in flight. Resolves to the parsed provider JSON, or throws with a
// readable message on failure.
export async function callProvider(provider, path, body, { signal } = {}) {
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, path, body }),
      signal,
    })
  } catch (err) {
    // Surface a cancellation as-is so callers can tell it apart from a real
    // failure and stay silent about it.
    if (err?.name === 'AbortError') throw err
    throw new Error('Could not reach the AI service. Check your connection and try again.')
  }

  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error body — fall back to raw text below */
  }

  if (!res.ok) {
    const detail = json?.error?.message || json?.error || text || ''
    throw new Error(`${labelFor(provider)} request failed (${res.status}). ${String(detail).slice(0, 200)}`)
  }
  return json
}

// Ask the server which providers have a key configured (for the Settings UI).
// Best-effort: resolves to { openai: false, anthropic: false } if unreachable.
export async function fetchProviderStatus() {
  try {
    const res = await fetch(ENDPOINT, { method: 'GET' })
    if (!res.ok) return { openai: false, anthropic: false }
    const json = await res.json()
    return json?.providers || { openai: false, anthropic: false }
  } catch {
    return { openai: false, anthropic: false }
  }
}
