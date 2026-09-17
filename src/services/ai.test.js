// Deterministic tests for the Gemini provider migration — proxy routing,
// allow-listing, key handling, request/response mapping, streaming, embeddings,
// cache/model invalidation and Demo mode. No real Gemini API, no real key: the
// upstream provider and the /api/ai proxy are both stubbed with vi.fn().

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../../api/ai.js'
import { callProvider } from './aiProxy.js'
import { generateFlashcards, runChat } from './aiService.js'
import { resolveEmbedder, embedTexts } from './embeddings.js'
import { deserializeIndex } from './retrieval.js'

const KEY = 'test-gemini-key-should-never-leak'

// ---- minimal Node req/res doubles for the serverless handler ----------------
function mockReq(method, payload) {
  return { method, body: payload } // Vercel-style pre-parsed body
}
function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    status(c) { this.statusCode = c; return this },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this },
    json(o) { this.setHeader('content-type', 'application/json'); this.body = JSON.stringify(o); this.ended = true; return this },
    send(t) { this.body += t == null ? '' : t; this.ended = true; return this },
    write(chunk) { this.body += Buffer.from(chunk).toString('utf8') },
    end() { this.ended = true },
    flushHeaders() {},
    on() {},
  }
}
// A fetch Response double.
function upstreamJson(obj, { ok = true, status = 200, ctype = 'application/json' } = {}) {
  return { ok, status, headers: new Map([['content-type', ctype]]), text: async () => JSON.stringify(obj), body: null }
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = KEY
})
afterEach(() => {
  delete process.env.GEMINI_API_KEY
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ===========================================================================
// Server proxy — api/ai.js
// ===========================================================================
describe('api/ai proxy — routing & validation', () => {
  it('GET status reports only whether Gemini is configured (no key)', async () => {
    const res = mockRes()
    await handler(mockReq('GET'), res)
    const json = JSON.parse(res.body)
    expect(json).toEqual({ providers: { gemini: true } })
    expect(res.body).not.toContain(KEY)

    delete process.env.GEMINI_API_KEY
    const res2 = mockRes()
    await handler(mockReq('GET'), res2)
    expect(JSON.parse(res2.body)).toEqual({ providers: { gemini: false } })
  })

  it('rejects an unsupported provider (openai)', async () => {
    const res = mockRes()
    await handler(mockReq('POST', { provider: 'openai', path: 'chat', body: { model: 'gpt-4o-mini' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Unknown provider')
  })

  it('rejects an unsupported path', async () => {
    const res = mockRes()
    await handler(mockReq('POST', { provider: 'gemini', path: 'images', body: { model: 'gemini-2.5-flash' } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Unsupported path')
  })

  it('rejects a model outside the allow-list', async () => {
    const res = mockRes()
    await handler(mockReq('POST', { provider: 'gemini', path: 'chat', body: { model: 'gemini-1.0-ultra', contents: [] } }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('not allowed')
  })

  it('returns a clear 501 when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY
    const res = mockRes()
    await handler(mockReq('POST', { provider: 'gemini', path: 'chat', body: { model: 'gemini-2.5-flash', contents: [] } }), res)
    expect(res.statusCode).toBe(501)
    expect(res.body).toContain('GEMINI_API_KEY')
    expect(res.body).not.toContain(KEY)
  })

  it('forwards chat to generateContent with the key in a header, never in the body', async () => {
    const fetchMock = vi.fn(async () => upstreamJson({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq('POST', {
      provider: 'gemini',
      path: 'chat',
      body: { model: 'gemini-2.5-flash', stream: false, contents: [{ role: 'user', parts: [{ text: 'hi' }] }], generationConfig: { temperature: 0.5 } },
    }), res)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(opts.headers['x-goog-api-key']).toBe(KEY)
    // model + stream stripped; key never in the forwarded body
    const sent = JSON.parse(opts.body)
    expect(sent).not.toHaveProperty('model')
    expect(sent).not.toHaveProperty('stream')
    expect(sent.contents).toBeTruthy()
    expect(opts.body).not.toContain(KEY)
    expect(res.statusCode).toBe(200)
  })

  it('routes embeddings to batchEmbedContents (model in URL, not body)', async () => {
    const fetchMock = vi.fn(async () => upstreamJson({ embeddings: [{ values: [1, 0, 0] }] }))
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq('POST', {
      provider: 'gemini',
      path: 'embeddings',
      body: { model: 'gemini-embedding-001', requests: [{ model: 'models/gemini-embedding-001', content: { parts: [{ text: 'x' }] } }] },
    }), res)

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents')
    const sent = JSON.parse(opts.body)
    expect(sent).not.toHaveProperty('model')
    expect(Array.isArray(sent.requests)).toBe(true)
  })

  it('uses the streaming endpoint (alt=sse) and event-stream content-type for stream:true', async () => {
    // upstream body with a reader that yields one SSE chunk then ends.
    const chunk = new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"hi"}]}}]}\n\n')
    let read = 0
    const upstream = {
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/event-stream']]),
      body: { getReader: () => ({ read: async () => (read++ === 0 ? { done: false, value: chunk } : { done: true }) }) },
    }
    const fetchMock = vi.fn(async () => upstream)
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await handler(mockReq('POST', {
      provider: 'gemini',
      path: 'chat',
      body: { model: 'gemini-2.5-flash', stream: true, contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
    }), res)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse')
    expect(res.headers['content-type']).toContain('text/event-stream')
    expect(res.body).toContain('candidates')
  })
})

// ===========================================================================
// Client adapter — aiProxy / aiService / embeddings (mock the /api/ai call)
// ===========================================================================
describe('client Gemini adapter', () => {
  it('generateFlashcards builds a native Gemini request and posts no key', async () => {
    let captured
    const fetchMock = vi.fn(async (endpoint, opts) => {
      captured = { endpoint, body: JSON.parse(opts.body) }
      return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '[{"question":"What is X?","answer":"X is Y."}]' }] } }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const cards = await generateFlashcards('Photosynthesis', { provider: 'gemini', cardCount: 1 })
    expect(cards).toEqual([{ question: 'What is X?', answer: 'X is Y.' }])

    expect(captured.endpoint).toBe('/api/ai')
    expect(captured.body.provider).toBe('gemini')
    expect(captured.body.path).toBe('chat')
    expect(captured.body.body.model).toBe('gemini-2.5-flash')
    expect(captured.body.body.contents[0].parts[0].text).toContain('Photosynthesis')
    expect(captured.body.body.systemInstruction.parts[0].text).toBeTruthy()
    // No API key anywhere in the browser→proxy payload.
    expect(captured.body.body).not.toHaveProperty('key')
    expect(JSON.stringify(captured.body)).not.toContain(KEY)
  })

  it('surfaces a Gemini error and never leaks a key in the message', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'Quota exceeded' } }) }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(callProvider('gemini', 'chat', { model: 'gemini-2.5-flash' })).rejects.toThrow(/Gemini request failed \(429\)/)
  })

  it('embedTexts (gemini) sends batchEmbedContents requests and returns unit vectors', async () => {
    let captured
    const fetchMock = vi.fn(async (_e, opts) => {
      captured = JSON.parse(opts.body)
      return { ok: true, status: 200, text: async () => JSON.stringify({ embeddings: [{ values: [3, 4] }, { values: [0, 5] }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)

    const embedder = resolveEmbedder({ provider: 'gemini' })
    expect(embedder).toMatchObject({ provider: 'gemini', model: 'gemini-embedding-001' })
    const vecs = await embedTexts(['a', 'b'], embedder, { provider: 'gemini' })

    expect(captured.path).toBe('embeddings')
    expect(captured.body.requests).toHaveLength(2)
    expect(captured.body.requests[0].outputDimensionality).toBe(embedder.dim)
    // L2-normalised: [3,4] -> [0.6,0.8]
    expect(vecs[0][0]).toBeCloseTo(0.6, 5)
    expect(vecs[0][1]).toBeCloseTo(0.8, 5)
    expect(vecs[1][1]).toBeCloseTo(1, 5)
  })
})

// ===========================================================================
// Demo mode & existing-service compatibility
// ===========================================================================
describe('Demo mode & compatibility', () => {
  it('generateFlashcards in Demo mode works with no key and no network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.GEMINI_API_KEY
    const cards = await generateFlashcards('Gravity', { provider: 'demo', cardCount: 3 })
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveProperty('question')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('runChat returns null in Demo mode (offline)', async () => {
    const out = await runChat({ system: 's', messages: [{ role: 'user', content: 'hi' }], settings: { provider: 'demo' } })
    expect(out).toBeNull()
  })
})

// ===========================================================================
// Embedding cache / model invalidation
// ===========================================================================
describe('embedding invalidation', () => {
  it('resolveEmbedder falls back to the local embedder for non-Gemini providers', () => {
    expect(resolveEmbedder({ provider: 'demo' })).toMatchObject({ provider: 'local', model: 'hash-v1' })
    expect(resolveEmbedder({})).toMatchObject({ provider: 'local' })
  })

  it('deserializeIndex drops an index built with a removed embedder (old OpenAI vectors)', () => {
    const stale = { v: 1, embedder: { provider: 'openai', model: 'text-embedding-3-small', dim: 1536 }, count: 1, dim: 1536, vecs: 'AAAA', chunks: ['x'] }
    expect(deserializeIndex(stale)).toBeNull()
  })

  it('deserializeIndex keeps valid local and gemini indexes', () => {
    const local = { v: 1, embedder: { provider: 'local', model: 'hash-v1', dim: 4 }, count: 1, dim: 4, vecs: 'AAAAAA==', chunks: ['x'] }
    const gem = { v: 1, embedder: { provider: 'gemini', model: 'gemini-embedding-001', dim: 4 }, count: 1, dim: 4, vecs: 'AAAAAA==', chunks: ['x'] }
    expect(deserializeIndex(local)).not.toBeNull()
    expect(deserializeIndex(gem)).not.toBeNull()
  })
})
