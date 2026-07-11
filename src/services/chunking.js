// Semantic chunking for the retrieval (RAG) pipeline.
//
// Splits a document into overlapping, sentence-aware chunks sized for
// embedding. Paragraph and sentence boundaries are preferred so each chunk is a
// coherent passage; a small overlap carries context across boundaries so a fact
// that straddles two chunks is still retrievable from either. Dependency-free
// and pure, so it behaves identically in Demo mode and when signed in.

const TARGET_CHARS = 900 // ~200-250 tokens: a coherent passage, cheap to embed
const OVERLAP_CHARS = 180 // trailing context repeated into the next chunk
const MIN_CHARS = 60 // drop slivers with too little signal to be useful
const MAX_CHUNKS = 80 // cap per document (storage + cost safety)

// Split a passage into sentences, keeping terminal punctuation.
function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Take roughly the last `chars` characters of a chunk, snapped to a sentence or
// word boundary, to seed the next chunk's overlap.
function tailOverlap(text, chars = OVERLAP_CHARS) {
  if (text.length <= chars) return text
  const tail = text.slice(text.length - chars)
  const sentenceStart = tail.search(/[.!?]\s+/)
  if (sentenceStart !== -1 && sentenceStart < chars - 20) {
    return tail.slice(sentenceStart + 1).trim()
  }
  const space = tail.indexOf(' ')
  return space !== -1 ? tail.slice(space + 1) : tail
}

// Chunk a document into [{ index, text }]. Options let callers tune sizing, but
// the defaults are tuned for PDF study material.
export function chunkText(text, opts = {}) {
  const target = opts.target || TARGET_CHARS
  const overlap = opts.overlap ?? OVERLAP_CHARS
  const maxChunks = opts.maxChunks || MAX_CHUNKS

  const clean = (text || '').replace(/\r/g, '').trim()
  if (!clean) return []

  const paragraphs = clean.split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)

  const chunks = []
  let current = ''

  const flush = () => {
    const body = current.trim()
    if (body.length >= MIN_CHARS) chunks.push(body)
    else if (body && chunks.length) chunks[chunks.length - 1] += ' ' + body // fold tiny tail back
    current = overlap > 0 && body.length >= MIN_CHARS ? tailOverlap(body, overlap) : ''
  }

  for (const para of paragraphs) {
    // A single oversized paragraph is broken along sentence boundaries.
    if (para.length > target) {
      for (const sentence of splitSentences(para)) {
        if (sentence.length > target) {
          // A single very long sentence: hard-wrap it.
          if (current.trim()) flush()
          for (let i = 0; i < sentence.length; i += target) {
            chunks.push(sentence.slice(i, i + target).trim())
          }
          current = ''
          continue
        }
        if ((current + ' ' + sentence).trim().length > target) flush()
        current = current ? `${current} ${sentence}` : sentence
      }
      continue
    }

    if ((current + '\n\n' + para).trim().length > target) flush()
    current = current ? `${current}\n\n${para}` : para
  }
  if (current.trim()) {
    const body = current.trim()
    if (body.length >= MIN_CHARS) chunks.push(body)
    else if (chunks.length) chunks[chunks.length - 1] += ' ' + body
  }

  return chunks
    .map((t) => t.replace(/\s+\n/g, '\n').trim())
    .filter((t) => t.length >= MIN_CHARS)
    .slice(0, maxChunks)
    .map((text, index) => ({ index, text }))
}
