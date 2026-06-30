import { useState } from 'react'

const MIN_LENGTH = 10

export default function TopicForm({ onGenerate, loading }) {
  const [topic, setTopic] = useState('')
  const [error, setError] = useState('')

  const remaining = MIN_LENGTH - topic.trim().length

  function handleSubmit(e) {
    e.preventDefault()
    const trimmed = topic.trim()
    if (trimmed.length < MIN_LENGTH) {
      setError(`Please enter at least ${MIN_LENGTH} characters.`)
      return
    }
    setError('')
    onGenerate(trimmed)
  }

  return (
    <form className="topic-form" onSubmit={handleSubmit}>
      <label htmlFor="topic">What do you want to study?</label>
      <div className="topic-input-row">
        <input
          id="topic"
          type="text"
          placeholder="e.g. The French Revolution, React Hooks, Photosynthesis…"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={loading}
          autoComplete="off"
        />
        <button type="submit" disabled={loading || topic.trim().length < MIN_LENGTH}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <div className="topic-meta">
        {error ? (
          <span className="error-text">{error}</span>
        ) : remaining > 0 ? (
          <span className="hint">Enter {remaining} more character{remaining === 1 ? '' : 's'}…</span>
        ) : (
          <span className="hint ok">Ready — 10 question/answer cards will be generated.</span>
        )}
      </div>
    </form>
  )
}
