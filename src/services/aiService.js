// AI service layer.
//
// generateFlashcards() returns an array of { question, answer } objects.
// It supports three modes, chosen via the `provider` setting:
//   - 'demo'      : a built-in mock generator. No API key, works offline.
//   - 'openai'    : OpenAI Chat Completions API (gpt-4o-mini), key required.
//   - 'anthropic' : Anthropic Claude Messages API, key required.
//
// The OpenAI/Anthropic paths call the provider directly from the browser,
// so the user supplies their own key via the Settings panel. For a public
// production app you would proxy these calls through a small backend so the
// key is never exposed — see the README "Future Improvements" section.

const SYSTEM_PROMPT =
  'You are a helpful study assistant that writes concise, accurate flashcards.'

function buildUserPrompt(topic, count) {
  return (
    `Create exactly ${count} study flashcards about the topic: "${topic}".\n` +
    `Return ONLY a JSON array, with no markdown fences or commentary. ` +
    `Each element must be an object with exactly two string fields: ` +
    `"question" and "answer". Keep each answer to 1-3 sentences.`
  )
}

// Prompt for generating cards from a passage of source material (e.g. a PDF).
function buildContentPrompt(content, count) {
  return (
    `Using ONLY the study material below, create up to ${count} flashcards that ` +
    `capture its most important facts, definitions, and concepts.\n` +
    `Return ONLY a JSON array, with no markdown fences or commentary. ` +
    `Each element must be an object with exactly two string fields: ` +
    `"question" and "answer". Keep each answer to 1-3 sentences.\n\n` +
    `STUDY MATERIAL:\n"""\n${content}\n"""`
  )
}

// Chunk sizing for large documents (keeps each request well under token limits).
const CHUNK_SIZE = 6000 // characters per chunk
const MAX_CHUNKS = 20 // safety cap on API calls for very large PDFs

// Split text into token-safe chunks, preferring paragraph boundaries.
function chunkText(text, size = CHUNK_SIZE, maxChunks = MAX_CHUNKS) {
  const clean = (text || '').trim()
  if (!clean) return []

  const paragraphs = clean.split(/\n{2,}/)
  const chunks = []
  let current = ''

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ''
  }

  for (const para of paragraphs) {
    if (para.length > size) {
      // Hard-split an oversized paragraph.
      pushCurrent()
      for (let i = 0; i < para.length; i += size) {
        chunks.push(para.slice(i, i + size).trim())
      }
      continue
    }
    if ((current + '\n\n' + para).length > size) pushCurrent()
    current = current ? `${current}\n\n${para}` : para
  }
  pushCurrent()

  return chunks.filter(Boolean).slice(0, maxChunks)
}

// Pull a JSON array out of a model response that may contain prose or code
// fences around it.
function extractCards(text) {
  if (!text) throw new Error('Empty response from the AI provider.')
  let cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()

  let data
  try {
    data = JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('Could not parse flashcards from the AI response.')
    data = JSON.parse(match[0])
  }

  if (!Array.isArray(data)) throw new Error('AI response was not a list of cards.')

  return data
    .filter((c) => c && c.question && c.answer)
    .map((c) => ({ question: String(c.question), answer: String(c.answer) }))
}

// ---------------------------------------------------------------------------
// Demo / mock generator
// ---------------------------------------------------------------------------
function mockGenerate(topic, count) {
  const t = topic.trim()
  const templates = [
    { q: `What is ${t} in simple terms?`, a: `${cap(t)} is a key concept; in short, it refers to the core idea and the problems it helps solve.` },
    { q: `Why is ${t} important?`, a: `${cap(t)} matters because it underpins related ideas and has practical, real-world applications.` },
    { q: `What are the main components of ${t}?`, a: `The main parts of ${t} work together as a system, each handling a distinct responsibility.` },
    { q: `Give a real-world example of ${t}.`, a: `A common example of ${t} appears in everyday tools and workflows that rely on it.` },
    { q: `What is a common misconception about ${t}?`, a: `People often oversimplify ${t}; the reality involves more nuance and important edge cases.` },
    { q: `How does ${t} relate to other concepts?`, a: `${cap(t)} connects to neighbouring topics, often serving as a foundation or a building block.` },
    { q: `What are the benefits of ${t}?`, a: `Key benefits of ${t} include efficiency, clarity, and broader applicability across use cases.` },
    { q: `What are the limitations of ${t}?`, a: `${cap(t)} has trade-offs and constraints that you should weigh before applying it.` },
    { q: `What is the history or origin of ${t}?`, a: `${cap(t)} evolved over time, shaped by earlier ideas and the needs that motivated it.` },
    { q: `How would you summarise ${t} in one sentence?`, a: `${cap(t)} is best summarised as a focused idea with clear purpose and practical value.` },
    { q: `What is a good first step to learn ${t}?`, a: `Start with the fundamentals of ${t}, then practise with small, concrete examples.` },
    { q: `What questions should you ask about ${t}?`, a: `Ask what problem ${t} solves, how it works, and where it is most useful.` },
  ]

  return templates.slice(0, count).map(({ q, a }) => ({ question: q, answer: a }))
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

// Content-aware demo generator: builds believable cards from extracted text
// by pulling out meaningful sentences. No API key required.
function mockGenerateFromContent(content, count) {
  const sentences = (content || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 320)

  if (!sentences.length) {
    return mockGenerate('this document', count)
  }

  // Spread picks across the whole passage rather than just the start.
  const step = Math.max(1, Math.floor(sentences.length / count))
  const cards = []
  for (let i = 0; i < sentences.length && cards.length < count; i += step) {
    const sentence = sentences[i]
    const topicWords = sentence.split(' ').slice(0, 6).join(' ').replace(/[",]$/, '')
    cards.push({
      question: `According to the material, what is noted about “${topicWords}…”?`,
      answer: sentence.endsWith('.') ? sentence : `${sentence}.`,
    })
  }
  return cards
}

// Simulate network latency so the demo loading state is visible.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------
async function openaiGenerate(userPrompt, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}). ${detail.slice(0, 200)}`)
  }

  const json = await res.json()
  return extractCards(json.choices?.[0]?.message?.content)
}

// ---------------------------------------------------------------------------
// Anthropic Claude
// ---------------------------------------------------------------------------
async function anthropicGenerate(userPrompt, apiKey, maxTokens = 1500) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Required to allow direct browser calls.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Anthropic request failed (${res.status}). ${detail.slice(0, 200)}`)
  }

  const json = await res.json()
  const text = Array.isArray(json.content)
    ? json.content.map((b) => b.text || '').join('')
    : ''
  return extractCards(text)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
export async function generateFlashcards(topic, settings) {
  const count = Math.min(Math.max(Number(settings.cardCount) || 10, 1), 20)
  const provider = settings.provider || 'demo'

  if (provider === 'openai') {
    if (!settings.apiKey) throw new Error('Add your OpenAI API key in Settings first.')
    return openaiGenerate(buildUserPrompt(topic, count), settings.apiKey)
  }

  if (provider === 'anthropic') {
    if (!settings.apiKey) throw new Error('Add your Anthropic API key in Settings first.')
    return anthropicGenerate(buildUserPrompt(topic, count), settings.apiKey)
  }

  // Demo mode
  await delay(900)
  return mockGenerate(topic, count)
}

// ---------------------------------------------------------------------------
// Study Assistant (chat)
//
// answerAssistant() replies to a student's question about the currently selected
// deck / PDF. The deck's flashcards are the assistant's source of truth (the raw
// PDF text isn't persisted). It supports follow-ups via the conversation history
// and can explain, simplify, give examples, compare concepts and build mnemonics
// — all driven by the prompt. Returns a plain-text answer string.
// ---------------------------------------------------------------------------
const MAX_HISTORY = 12 // prior turns sent for context (token safety)
const MAX_CONTEXT_CARDS = 40 // cards included as source material

function buildAssistantSystem(deck) {
  const topic = deck?.topic || 'the selected deck'
  const kind = deck?.source === 'pdf' ? 'uploaded PDF' : 'study deck'
  return (
    `You are an AI study assistant helping a student learn from their ${kind} titled "${topic}". ` +
    `Use the provided flashcards below as your primary source of truth about what the student is studying. ` +
    `You can answer questions, explain concepts, simplify topics for a beginner, generate concrete examples, ` +
    `compare and contrast concepts, and create memorable mnemonics. ` +
    `Be clear, accurate and concise — a few short paragraphs at most, in plain text (no markdown headings). ` +
    `If a question goes beyond the deck, answer from general knowledge and briefly note that it's outside the deck.`
  )
}

function deckContext(deck, max = MAX_CONTEXT_CARDS) {
  const cards = (deck?.cards || []).slice(0, max)
  if (!cards.length) return 'No flashcards are available for this deck yet.'
  return cards.map((c, i) => `${i + 1}. Q: ${c.question}\n   A: ${c.answer}`).join('\n')
}

async function openaiChat(system, msgs, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 700,
      messages: [{ role: 'system', content: system }, ...msgs],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI request failed (${res.status}). ${detail.slice(0, 200)}`)
  }
  const json = await res.json()
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Empty response from OpenAI.')
  return text
}

async function anthropicChat(system, msgs, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 800,
      temperature: 0.5,
      system,
      messages: msgs,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Anthropic request failed (${res.status}). ${detail.slice(0, 200)}`)
  }
  const json = await res.json()
  const text = Array.isArray(json.content) ? json.content.map((b) => b.text || '').join('').trim() : ''
  if (!text) throw new Error('Empty response from Anthropic.')
  return text
}

// ---- Demo assistant: a context-aware, offline mock (no API key) ----
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'is', 'and', 'or', 'for', 'on', 'what', 'why', 'how',
  'are', 'was', 'were', 'that', 'this', 'it', 'as', 'be', 'with', 'about', 'explain', 'simple',
  'simply', 'simplify', 'example', 'compare', 'mnemonic', 'give', 'me', 'create', 'difference',
  'between', 'vs', 'can', 'you', 'please', 'from', 'deck', 'concept', 'concepts', 'key', 'main',
])

function tokenize(s) {
  return (s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP_WORDS.has(w)) || []
}

function rankCards(question, deck, n = 3) {
  const words = tokenize(question)
  const cards = deck?.cards || []
  const scored = cards
    .map((c) => {
      const hay = tokenize(`${c.question} ${c.answer}`)
      const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0)
      return { c, score }
    })
    .sort((a, b) => b.score - a.score)
  const hits = scored.filter((s) => s.score > 0).map((s) => s.c)
  return (hits.length ? hits : cards).slice(0, n)
}

function keyTerm(card) {
  return tokenize(card?.question)[0] || tokenize(card?.answer)[0] || ''
}

function firstSentence(text) {
  return ((text || '').split(/(?<=[.!?])\s+/)[0] || text || '').trim()
}

function mockAnswer(question, deck) {
  const topic = deck?.topic || 'this deck'
  const cards = deck?.cards || []
  if (!cards.length) {
    return `I don't have any cards for “${topic}” yet, so there's nothing to draw on. Generate a few flashcards first and I can explain, simplify or quiz you on them.`
  }
  const q = question.toLowerCase()
  const picks = rankCards(question, deck, 3)
  const top = picks[0]

  if (/mnemonic|memor|remember/.test(q)) {
    const terms = [...new Set(picks.map(keyTerm).filter(Boolean))].slice(0, 4)
    const letters = terms.map((t) => t[0].toUpperCase()).join('')
    return (
      `Here's a mnemonic for “${topic}”:\n\n` +
      `${letters || 'KEY'} — ${terms.join(', ') || 'the core ideas'}.\n\n` +
      `Link each letter to its idea: ${terms.map((t) => `${t[0].toUpperCase()} = ${t}`).join('; ')}. ` +
      `Picture them together in one vivid scene to make it stick.`
    )
  }
  if (/(compare|contrast|differ|versus|\bvs\b)/.test(q) && picks.length >= 2) {
    return (
      `Comparing two ideas from “${topic}”:\n\n` +
      `• ${picks[0].question} — ${picks[0].answer}\n` +
      `• ${picks[1].question} — ${picks[1].answer}\n\n` +
      `The first centres on ${keyTerm(picks[0]) || 'one idea'}, while the second is about ${keyTerm(picks[1]) || 'another'}.`
    )
  }
  if (/(example|instance|real.?world|use case|use-case)/.test(q)) {
    return (
      `Here's an example tied to “${keyTerm(top) || topic}”:\n\n` +
      `${top.answer}\n\n` +
      `In practice, picture a situation where ${keyTerm(top) || 'this concept'} is doing the work — that's the idea applied.`
    )
  }
  if (/(simpl|eli5|beginner|plain|easy|basic)/.test(q)) {
    return `In simple terms: ${firstSentence(top.answer)}\n\nFrom your deck — ${top.question} ${top.answer}`
  }
  // explain / default
  const body = picks.slice(0, 2).map((c) => `• ${c.question} ${c.answer}`).join('\n')
  return (
    `Here's what your “${topic}” deck covers on that:\n\n${body}\n\n` +
    `Want me to simplify it, give an example, or turn it into a mnemonic? Just ask.`
  )
}

// Answer a study-assistant question about a deck / PDF.
//   { question, deck, history: Message[], settings } -> Promise<string>
// `history` is the prior conversation (user/assistant turns) for follow-up context.
export async function answerAssistant({ question, deck, history = [], settings }) {
  const q = String(question || '').trim()
  if (!q) throw new Error('Ask a question to get started.')
  const provider = settings?.provider || 'demo'

  // Map prior turns to provider roles, bounded for token safety.
  const prior = (history || [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.text)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.text) }))
  const msgs = [...prior, { role: 'user', content: q }]
  const system = `${buildAssistantSystem(deck)}\n\nFLASHCARDS:\n${deckContext(deck)}`

  if (provider === 'openai') {
    if (!settings.apiKey) throw new Error('Add your OpenAI API key in Settings first.')
    return openaiChat(system, msgs, settings.apiKey)
  }
  if (provider === 'anthropic') {
    if (!settings.apiKey) throw new Error('Add your Anthropic API key in Settings first.')
    // Anthropic requires the first message to be from the user.
    const trimmed = [...msgs]
    while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift()
    return anthropicChat(system, trimmed, settings.apiKey)
  }

  // Demo mode — offline, deck-aware mock.
  await delay(600)
  return mockAnswer(q, deck)
}

// Generate flashcards from a block of source content (e.g. extracted PDF text).
// Large content is chunked to stay under token limits, and the cards from every
// chunk are merged (and de-duplicated) into a single list.
// onProgress({ current, total }) reports which chunk is being processed.
export async function generateFlashcardsFromContent(content, settings, { onProgress } = {}) {
  const perChunk = Math.min(Math.max(Number(settings.cardCount) || 10, 1), 20)
  const provider = settings.provider || 'demo'

  if ((content || '').trim().length < 30) {
    throw new Error('The PDF did not contain enough readable text to generate flashcards.')
  }

  // Validate keys once, up front (before making any calls).
  if (provider === 'openai' && !settings.apiKey) {
    throw new Error('Add your OpenAI API key in Settings first.')
  }
  if (provider === 'anthropic' && !settings.apiKey) {
    throw new Error('Add your Anthropic API key in Settings first.')
  }

  const chunks = chunkText(content)
  const merged = []
  const seen = new Set()

  for (let i = 0; i < chunks.length; i++) {
    if (onProgress) onProgress({ current: i + 1, total: chunks.length })

    let cards
    if (provider === 'openai') {
      cards = await openaiGenerate(buildContentPrompt(chunks[i], perChunk), settings.apiKey)
    } else if (provider === 'anthropic') {
      cards = await anthropicGenerate(buildContentPrompt(chunks[i], perChunk), settings.apiKey, 2000)
    } else {
      await delay(500)
      cards = mockGenerateFromContent(chunks[i], perChunk)
    }

    for (const card of cards) {
      const key = card.question.trim().toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(card)
      }
    }
  }

  if (!merged.length) {
    throw new Error('No cards could be generated from this PDF. Try a different file or page range.')
  }
  return merged
}
