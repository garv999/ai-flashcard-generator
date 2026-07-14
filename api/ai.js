// Server-side AI proxy.
//
// Provider API keys (OpenAI / Anthropic) live ONLY on the server, in env vars —
// they are never shipped in the client bundle, stored in the browser, or sent
// in outbound browser requests. The client posts { provider, path, body } to
// this endpoint; we inject the key and forward the request to the real provider
// API, then stream the response back. Demo mode never touches this endpoint.
//
// This is a standard Node serverless function (Vercel `api/` convention). The
// same handler is mounted into the Vite dev server (see vite.config.js) so
// `npm run dev` proxies locally too, reading keys from `.env`.
//
// Deploy: set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in the host's environment.

const UPSTREAM = {
  openai: {
    envKey: 'OPENAI_API_KEY',
    paths: {
      chat: 'https://api.openai.com/v1/chat/completions',
      embeddings: 'https://api.openai.com/v1/embeddings',
    },
  },
  anthropic: {
    envKey: 'ANTHROPIC_API_KEY',
    paths: {
      chat: 'https://api.anthropic.com/v1/messages',
    },
  },
}

// Only these models may pass through, so the proxy can't be abused as an
// open-ended gateway to the account's API credits.
const ALLOWED_MODELS = new Set([
  'gpt-4o-mini',
  'text-embedding-3-small',
  'claude-sonnet-5',
])

function hasKey(provider) {
  const cfg = UPSTREAM[provider]
  return !!(cfg && process.env[cfg.envKey])
}

// Provider-specific auth headers, built from the server-side key.
function authHeaders(provider, key) {
  if (provider === 'openai') return { Authorization: `Bearer ${key}` }
  // Anthropic: key + required API version (set server-side, not by the client).
  return { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
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

export default async function handler(req, res) {
  // Status probe: which providers are configured. Reveals no secret material —
  // only whether a key is present — so the Settings UI can show availability.
  if (req.method === 'GET') {
    return res.status(200).json({
      providers: { openai: hasKey('openai'), anthropic: hasKey('anthropic') },
    })
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
  const url = cfg.paths[path]
  if (!url) return res.status(400).json({ error: `Unsupported path "${path}" for ${provider}.` })
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Missing request body.' })
  if (body.model && !ALLOWED_MODELS.has(body.model)) {
    return res.status(400).json({ error: `Model "${body.model}" is not allowed through this proxy.` })
  }

  const key = process.env[cfg.envKey]
  if (!key) {
    return res.status(501).json({
      error: `${provider} is not configured on this server. Set ${cfg.envKey} to enable it, or use Demo mode.`,
    })
  }

  const headers = { 'Content-Type': 'application/json', ...authHeaders(provider, key) }

  // Streaming path: the client asked for token-by-token output (stream: true).
  // Forward the provider's Server-Sent Events straight through to the browser.
  if (body.stream) {
    // Cancel the upstream request if the browser disconnects mid-stream.
    const ac = new AbortController()
    let finished = false
    res.on('close', () => {
      if (!finished) ac.abort()
    })

    let upstream
    try {
      upstream = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal })
    } catch (e) {
      finished = true
      return res.status(502).json({ error: `Upstream request failed: ${e?.message || e}` })
    }

    // A pre-stream failure (bad key, rate limit, …) comes back as JSON, not SSE —
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
      body: JSON.stringify(body),
    })
    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    return res.send(text)
  } catch (e) {
    return res.status(502).json({ error: `Upstream request failed: ${e?.message || e}` })
  }
}
