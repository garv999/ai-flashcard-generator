// Visual learning support — deterministic diagram/table generation for Demo
// mode (offline, no API key). The LLM providers are instructed to emit their own
// Mermaid / tables; this module gives the offline coach the same capability by
// building diagrams from the deck's cards and retrieved document passages.
//
// Output is plain text containing a ```mermaid fenced block or a Markdown table,
// which the chat renderer turns into an SVG diagram / HTML table. Returns null
// when a question doesn't call for a visual, so simple questions stay text.

// Strip characters that would break Mermaid node labels / table cells, collapse
// whitespace, and truncate on a word boundary.
function label(s, max = 58) {
  const clean = String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/["`[\]{}|<>()]/g, '')
    .trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > 20 ? cut.slice(0, sp) : cut).trim() + '…'
}

// Pull the concept a Q/A card is about from its question ("What is X?" → "X").
function subject(question, max = 46) {
  const s = String(question || '')
    .replace(/^\s*(what|which|who|where|when|why|how)\b.*?\b(is|are|was|were|do|does|did|can|should)\b/i, '')
    .replace(/^\s*(define|describe|explain|list|name|give)\b/i, '')
    .replace(/\?+\s*$/, '')
    .trim()
  return label(s || question, max)
}

function sentences(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15)
}

const tokenize = (s) => (s || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2) || []

// Cards most relevant to the question (falls back to deck order).
function topCards(question, deck, n) {
  const words = tokenize(question)
  const cards = deck?.cards || []
  const scored = cards
    .map((c) => {
      const hay = tokenize(`${c.question} ${c.answer}`)
      return { c, score: words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) }
    })
    .sort((a, b) => b.score - a.score)
  const hits = scored.filter((s) => s.score > 0).map((s) => s.c)
  return (hits.length ? hits : cards).slice(0, n)
}

// Choose the best visual format for a question, or null to keep it as text.
export function pickVisual(question) {
  const q = String(question || '').toLowerCase()
  // Explicit text-format requests (a mnemonic, "in simple terms") are prose by
  // nature and take precedence over any incidental diagram keyword.
  if (/\bmnemonic|acronym\b/.test(q)) return null
  if (/\bsimplif|eli5|in simple terms|like i'?m (a |an )?/.test(q)) return null
  // Triggers are deliberately conservative: fire only on clear visual intent so
  // ordinary content questions ("how do plants use X", "...a TCP connection")
  // stay as prose.
  if (/\b(compare|compari|contrast|difference|differ|versus|vs\b|pros and cons)\b/.test(q)) return 'table'
  if (/\b(timeline|chronolog|order of|evolution|over time|history of|historical)\b/.test(q)) return 'timeline'
  if (/\b(step by step|steps|process|procedure|algorithm|workflow|pipeline|stages|life ?cycle)\b/.test(q)) return 'flowchart'
  if (/\b(types of|kinds of|categor|classif|taxonomy|hierarch|breakdown|structure of|parts of|components of|anatomy of)\b/.test(q)) return 'tree'
  if (
    /\b(mind ?map|concept map|overview|outline|diagram|visuali[sz]e)\b/.test(q) ||
    /\b(show|draw|make|create|give)\b.{0,16}\b(map|diagram|chart|graph)\b/.test(q)
  )
    return 'mindmap'
  return null
}

const wrapMermaid = (intro, code) => (code ? `${intro}\n\n\`\`\`mermaid\n${code}\`\`\`` : null)

// A tree / mind-map of the deck: topic → key concepts (from the cards).
function treeGraph(deck, dir = 'TD') {
  const topic = label(deck?.topic || 'Topic', 40)
  const cards = topCards('', deck, 6)
  if (cards.length < 2) return null
  let g = `graph ${dir}\n  root["${topic}"]\n`
  cards.forEach((c, i) => {
    g += `  root --> n${i}["${subject(c.question)}"]\n`
  })
  return g
}

// A flowchart of an ordered process — steps from the top passage, else cards.
function flowGraph(question, deck, results) {
  let steps = []
  if (results && results[0]) steps = sentences(results[0].chunk.text).slice(0, 5)
  if (steps.length < 2) steps = topCards(question, deck, 5).map((c) => c.answer)
  steps = steps.map((s) => label(s, 62)).filter(Boolean).slice(0, 6)
  if (steps.length < 2) return null
  let g = 'graph TD\n'
  steps.forEach((s, i) => (g += `  s${i}["${i + 1}. ${s}"]\n`))
  for (let i = 0; i < steps.length - 1; i++) g += `  s${i} --> s${i + 1}\n`
  return g
}

// A Mermaid timeline of ordered stages / events.
function timelineDiagram(question, deck, results) {
  const topic = label(deck?.topic || 'Timeline', 40)
  let items = []
  if (results && results[0]) items = sentences(results[0].chunk.text).slice(0, 5)
  if (items.length < 2) items = topCards(question, deck, 5).map((c) => c.answer)
  items = items.map((s) => label(s, 50)).filter(Boolean).slice(0, 6)
  if (items.length < 2) return null
  let g = `timeline\n  title ${topic}\n`
  items.forEach((s, i) => (g += `  ${i + 1} : ${s}\n`))
  return wrapMermaid(`A timeline for “${topic}”:`, g)
}

// A Markdown comparison table across the most relevant concepts.
function comparisonTable(question, deck) {
  const cards = topCards(question, deck, 3).filter((c) => c.question && c.answer)
  if (cards.length < 2) return null
  const rows = cards
    .slice(0, 3)
    .map((c) => `| ${label(subject(c.question), 40)} | ${label(c.answer, 90)} |`)
    .join('\n')
  return `Here's a comparison:\n\n| Concept | Key idea |\n| --- | --- |\n${rows}`
}

// Decide whether to answer a question visually, and build the visual. Returns a
// message string (intro + diagram/table) or null to fall back to a text answer.
export function maybeVisual({ question, deck, results }) {
  const type = pickVisual(question)
  if (!type) return null
  const topic = deck?.topic || 'this topic'
  switch (type) {
    case 'table':
      return comparisonTable(question, deck)
    case 'flowchart':
      return wrapMermaid('Here’s the process as a flowchart:', flowGraph(question, deck, results))
    case 'timeline':
      return timelineDiagram(question, deck, results)
    case 'tree':
      return wrapMermaid(`A breakdown of “${topic}”:`, treeGraph(deck, 'TD'))
    case 'mindmap':
      return wrapMermaid(`A concept map of “${topic}”:`, treeGraph(deck, 'LR'))
    default:
      return null
  }
}
