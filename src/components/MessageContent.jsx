import Mermaid from './Mermaid.jsx'

// Renders an assistant message that may contain visual structures alongside
// prose: ```mermaid diagrams, other fenced code (algorithms/pseudocode), and
// Markdown comparison tables. Everything else renders as plain text with the
// bubble's existing whitespace handling, so simple answers look exactly as
// before. Parsing is done on the stored raw text, so visuals survive reload.

const splitRow = (line) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())

// A Markdown table separator row, e.g. "| --- | :--: |".
function isSeparator(line) {
  if (!line || !line.includes('|') || !line.includes('-')) return false
  return /^[\s|:-]+$/.test(line)
}

// Split a run of prose into text and Markdown-table blocks.
function parseProse(chunk, blocks) {
  const lines = chunk.split('\n')
  let buf = []
  const flushText = () => {
    const text = buf.join('\n').replace(/^\n+|\n+$/g, '')
    if (text.trim()) blocks.push({ type: 'text', text })
    buf = []
  }
  let i = 0
  while (i < lines.length) {
    const header = lines[i]
    const sep = lines[i + 1]
    if (header && header.includes('|') && isSeparator(sep)) {
      flushText()
      const head = splitRow(header)
      const body = []
      let j = i + 2
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) {
        body.push(splitRow(lines[j]))
        j++
      }
      blocks.push({ type: 'table', head, body })
      i = j
    } else {
      buf.push(header)
      i++
    }
  }
  flushText()
}

// Parse a message into an ordered list of blocks.
function parseBlocks(text) {
  const blocks = []
  const fence = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m
  while ((m = fence.exec(text)) !== null) {
    if (m.index > last) parseProse(text.slice(last, m.index), blocks)
    const lang = (m[1] || '').toLowerCase()
    const code = m[2].replace(/\n$/, '')
    if (lang === 'mermaid') blocks.push({ type: 'mermaid', code })
    else blocks.push({ type: 'code', lang, code })
    last = fence.lastIndex
  }
  if (last < text.length) parseProse(text.slice(last), blocks)
  return blocks
}

export default function MessageContent({ text }) {
  const blocks = parseBlocks(text || '')
  // Fast path: a plain-text answer renders exactly as before.
  if (blocks.length === 1 && blocks[0].type === 'text') return blocks[0].text
  if (blocks.length === 0) return text || ''

  return (
    <div className="chat-rich">
      {blocks.map((b, i) => {
        if (b.type === 'mermaid') return <Mermaid key={i} code={b.code} />
        if (b.type === 'code')
          return (
            <pre key={i} className="chat-code">
              <code>{b.code}</code>
            </pre>
          )
        if (b.type === 'table')
          return (
            <div key={i} className="chat-table-wrap">
              <table className="chat-table">
                {b.head?.length > 0 && (
                  <thead>
                    <tr>
                      {b.head.map((c, k) => (
                        <th key={k}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {b.body.map((row, r) => (
                    <tr key={r}>
                      {row.map((c, k) => (
                        <td key={k}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        return (
          <span key={i} className="chat-text">
            {b.text}
          </span>
        )
      })}
    </div>
  )
}
