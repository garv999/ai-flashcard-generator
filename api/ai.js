// Server-side AI proxy — Google Gemini.
//
// The Gemini API key lives ONLY on the server, in an env var (GEMINI_API_KEY) —
// it is never shipped in the client bundle, stored in the browser, or sent in
// outbound browser requests. The client posts { provider, path, body } to this
// endpoint; we look up a FIXED internal Gemini endpoint (the client can never
// supply an arbitrary upstream URL), inject the key as a header, forward the
// request, and stream the response back. Demo mode never touches this endpoint.
//
// This is a standard Node serverless function (Vercel `api/` convention). The
// same handler is mounted into the Vite dev server (see vite.config.js) so
// `npm run dev` proxies locally too, reading the key from `.env`.
//
// Deploy: set GEMINI_API_KEY in the host's environment.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Fixed, allow-listed operation per logical path. The model goes in the URL, so
// the client can never point the proxy at an arbitrary host or endpoint.
const UPSTREAM = {
  gemini: {
    envKey: 'GEMINI_API_KEY',
    ops: {
      chat: 'generateContent',
      chatStream: 'streamGenerateContent',
      embeddings: 'batchEmbedContents',
    },
  },
}

// Only these models may pass through, so the proxy can't be abused as an
// open-ended gateway to the account's API credits.
const ALLOWED_MODELS = new Set(['gemini-3.6-flash', 'gemini-embedding-001'])

function hasKey(provider) {
  const cfg = UPSTREAM[provider]
  return !!(cfg && process.env[cfg.envKey])
}

// Read a JSON body whether the platform pre-parsed it (Vercel) or handed us a
// raw stream (Vite dev middleware / Node).
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

// Build the fixed upstream Gemini URL for a validated model + operation. `stream`
// selects the SSE variant for chat.
function geminiUrl(cfg, path, model, stream) {
  const op = stream && path === 'chat' ? cfg.ops.chatStream : cfg.ops[path]
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:${op}`
  return stream && path === 'chat' ? `${url}?alt=sse` : url
}

export default async function handler(req, res) {
  // Status probe: whether Gemini is configured. Reveals no secret material —
  // only whether a key is present — so the Settings UI can show availability.
  if (req.method === 'GET') {
    return res.status(200).json({ providers: { gemini: hasKey('gemini') } })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  let payload
  try {
    payload = await readJson(req)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body.' })
  }

  const { provider, path, body } = payload || {}
  const cfg = UPSTREAM[provider]
  if (!cfg) return res.status(400).json({ error: `Unknown provider "${provider}".` })
  if (!cfg.ops[path]) return res.status(400).json({ error: `Unsupported path "${path}" for ${provider}.` })
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Missing request body.' })
  if (!body.model || !ALLOWED_MODELS.has(body.model)) {
    return res.status(400).json({ error: `Model "${body.model}" is not allowed through this proxy.` })
  }

  const key = process.env[cfg.envKey]
  if (!key) {
    return res.status(501).json({
      error: `Gemini is not configured on this server. Set ${cfg.envKey} to enable it, or use Demo mode.`,
    })
  }

  // Gemini takes the model in the URL and never accepts `model`/`stream` in the
  // request body — strip them and forward only the real provider payload.
  const { model, stream, ...forward } = body
  const url = geminiUrl(cfg, path, model, stream)
  const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key }

  // Streaming path: the client asked for token-by-token output (stream: true).
  // Gemini's :streamGenerateContent?alt=sse emits Server-Sent Events — forward
  // them straight through to the browser.
  if (stream && path === 'chat') {
    // Cancel the upstream request if the browser disconnects mid-stream.
    const ac = new AbortController()
    let finished = false
    res.on('close', () => {
      if (!finished) ac.abort()
    })

    let upstream
    try {
      upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(forward), signal: ac.signal })
    } catch (e) {
      finished = true
      return res.status(502).json({ error: `Upstream request failed: ${e?.message || e}` })
    }

    // A pre-stream failure (bad key, quota, …) comes back as JSON, not SSE —
    // pass it through so the client can surface a real error.
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '')
      finished = true
      res.status(upstream.status || 502)
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      return res.send(text || JSON.stringify({ error: 'Upstream error.' }))
    }

    res.status(200)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    if (typeof res.flushHeaders === 'function') res.flushHeaders()

    const reader = upstream.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
    } catch {
      // Client disconnect or upstream cut the stream — just stop writing.
    } finally {
      finished = true
      res.end()
    }
    return
  }

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(forward),
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (e) {
    return res.status(502).json({ error: `Upstream request failed: ${e?.message || e}` })
  }
}
