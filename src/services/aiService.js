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

// Simulate network latency so the demo loading state is visible.
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------
async function openaiGenerate(topic, count, apiKey) {
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
        { role: 'user', content: buildUserPrompt(topic, count) },
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
async function anthropicGenerate(topic, count, apiKey) {
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
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(topic, count) }],
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
    return openaiGenerate(topic, count, settings.apiKey)
  }

  if (provider === 'anthropic') {
    if (!settings.apiKey) throw new Error('Add your Anthropic API key in Settings first.')
    return anthropicGenerate(topic, count, settings.apiKey)
  }

  // Demo mode
  await delay(900)
  return mockGenerate(topic, count)
}
