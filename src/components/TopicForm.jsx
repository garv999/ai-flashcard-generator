import { useState } from 'react'
import { SparklesIcon } from './Icons.jsx'

const MIN_LENGTH = 10

export default function TopicForm({ onGenerate, loading }) {
  const [topic, setTopic] = useState('')
  const [error, setError] = useState('')

  const trimmedLength = topic.trim().length
  const remaining = MIN_LENGTH - trimmedLength
  const ready = trimmedLength >= MIN_LENGTH

  function handleSubmit(e) {
    e.preventDefault()
    if (!ready) {
      setError(`Please enter at least ${MIN_LENGTH} characters.`)
      return
    }
    setError('')
    onGenerate(topic.trim())
  }

  return (
    <form className="topic-form" onSubmit={handleSubmit} data-reveal="up">
      <label htmlFor="topic">What do you want to study?</label>
      <div className="topic-input-row">
        <input
          id="topic"
          type="text"
          placeholder="e.g. The French Revolution, React Hooks, Photosynthesis…"
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value)
            if (error) setError('')
          }}
          disabled={loading}
          autoComplete="off"
          aria-invalid={!!error}
          aria-describedby="topic-meta"
        />
        <button type="submit" className="btn-primary" disabled={loading || !ready}>
          <SparklesIcon />
          {loading ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <div className="topic-meta" id="topic-meta" role="status" aria-live="polite">
        {error ? (
          <span className="error-text">{error}</span>
        ) : remaining > 0 ? (
          <span className="hint">
            Enter {remaining} more character{remaining === 1 ? '' : 's'}…
          </span>
        ) : (
          <span className="hint ok">Ready — 10 question/answer cards will be generated.</span>
        )}
      </div>
    </form>
  )
}
