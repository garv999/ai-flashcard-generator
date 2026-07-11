import { useState, useEffect } from 'react'

// Mermaid is heavy, so it's loaded on demand (dynamic import) the first time a
// diagram needs rendering — the initial app bundle stays lean. Initialized once,
// in a dark theme matched to the app, with strict security since the diagram
// source can come from an LLM.
let mermaidPromise = null
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'dark',
        fontFamily: 'inherit',
        themeVariables: {
          background: '#17181d',
          primaryColor: '#1f2026',
          primaryTextColor: '#eceefb',
          primaryBorderColor: '#6f8bff',
          lineColor: '#6b7196',
          secondaryColor: '#212227',
          tertiaryColor: '#101116',
          fontSize: '13px',
        },
      })
      return mermaid
    })
  }
  return mermaidPromise
}

let idSeq = 0

// Renders one Mermaid diagram to inline SVG. On any parse/render error it falls
// back to showing the raw diagram source, so a malformed diagram never breaks
// the chat.
export default function Mermaid({ code }) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg('')
    setFailed(false)
    const id = `mmd-${++idSeq}`
    getMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
        // Mermaid may leave a temp measurement node behind on failure.
        document.getElementById(id)?.remove()
        document.getElementById(`d${id}`)?.remove()
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (failed) {
    return (
      <pre className="chat-code chat-code-fallback">
        <code>{code}</code>
      </pre>
    )
  }
  if (!svg) {
    return (
      <div className="chat-diagram chat-diagram-loading" role="status">
        Rendering diagram…
      </div>
    )
  }
  return (
    <div
      className="chat-diagram"
      role="img"
      aria-label="Diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
