// Client wrapper for the server-side AI proxy (`/api/ai`).
//
// The browser never calls OpenAI / Anthropic directly and never holds a provider
// key — it posts the request body to our own endpoint, which injects the key
// server-side (see api/ai.js). This module is the single place the client talks
// to that proxy. Demo mode doesn't use it.

const ENDPOINT = '/api/ai'

function labelFor(provider) {
  return provider === 'gemini' ? 'Gemini' : 'AI'
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

// Extract the incremental text from one parsed SSE `data:` payload.
//   Gemini: candidates[0].content.parts[*].text (streamGenerateContent?alt=sse)
// Gemini can also deliver an error object mid-stream — throw so the caller can
// surface it. Unknown/malformed shapes yield no text (never crash the stream).
function deltaFor(provider, json) {
  if (!json || typeof json !== 'object') return ''
  if (json.error) throw new Error(json.error?.message || String(json.error))
  if (provider === 'gemini') {
    const parts = json.candidates?.[0]?.content?.parts
    return Array.isArray(parts) ? parts.map((p) => p?.text || '').join('') : ''
  }
  return ''
}

// Pull the `data:` payloads out of one SSE event block (lines up to a blank line).
function dataPayloads(rawEvent) {
  const out = []
  for (const line of rawEvent.split('\n')) {
    const l = line.replace(/\r$/, '')
    if (l.startsWith('data:')) out.push(l.slice(5).replace(/^ /, ''))
  }
  return out
}

// Stream a provider chat request through the proxy. Sends `stream: true`, reads
// the Server-Sent Events, and invokes `onToken(delta)` for each chunk of text as
// it arrives. Resolves to the full accumulated text. Falls back to a one-shot
// JSON read if the server didn't actually stream. Throws (readable message, or a
// rethrown AbortError) on failure — exactly like callProvider.
export async function streamProvider(provider, path, body, { signal, onToken } = {}) {
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, path, body: { ...body, stream: true } }),
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw new Error('Could not reach the AI service. Check your connection and try again.')
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* non-JSON error body */
    }
    const detail = json?.error?.message || json?.error || text || ''
    throw new Error(`${labelFor(provider)} request failed (${res.status}). ${String(detail).slice(0, 200)}`)
  }

  // Server didn't stream (unexpected) — read it as one JSON blob and emit once.
  const ctype = res.headers.get('content-type') || ''
  if (!res.body || !ctype.includes('text/event-stream')) {
    const json = await res.json().catch(() => null)
    const parts = json?.candidates?.[0]?.content?.parts
    const full = Array.isArray(parts) ? parts.map((p) => p?.text || '').join('') : ''
    if (full && onToken) onToken(full)
    return full
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  const drainEvent = (rawEvent) => {
    for (const payload of dataPayloads(rawEvent)) {
      if (payload === '[DONE]') continue // OpenAI end sentinel
      let json
      try {
        json = JSON.parse(payload)
      } catch {
        continue
      }
      const delta = deltaFor(provider, json)
      if (delta) {
        full += delta
        if (onToken) onToken(delta)
      }
    }
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      drainEvent(buffer.slice(0, idx))
      buffer = buffer.slice(idx + 2)
    }
  }
  if (buffer.trim()) drainEvent(buffer) // flush any trailing event

  return full
}

// Ask the server whether Gemini has a key configured (for the Settings UI).
// Best-effort: resolves to { gemini: false } if unreachable.
export async function fetchProviderStatus() {
  try {
    const res = await fetch(ENDPOINT, { method: 'GET' })
    if (!res.ok) return { gemini: false }
    const json = await res.json()
    return json?.providers || { gemini: false }
  } catch {
    return { gemini: false }
  }
}
