import { Component } from 'react'

// A small, dependency-free error boundary. React only recovers from render/
// lifecycle errors via a class component, so this stays a class.
//
// Two ways to use it:
//   • App-level: wrap <App/> so any render crash shows a friendly reload screen
//     instead of a blank white page.
//   • Scoped: wrap a risky subtree (e.g. the WebGL hero) with `fallback={null}`
//     or a lightweight fallback, so a failure there degrades gracefully without
//     taking down the rest of the app.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Keep a console trail for debugging; a real logging sink (e.g. Sentry) can
    // be attached here later without touching call sites.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error, info?.componentStack)
    this.props.onError?.(error, info)
  }

  handleReset = () => {
    // Let a scoped boundary retry its subtree; the app-level one reloads.
    if (this.props.onReset) this.props.onReset()
    else this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    // Scoped usage: caller supplied its own fallback (element or null).
    if (this.props.fallback !== undefined) return this.props.fallback

    // Default app-level fallback.
    return (
      <div className="app-error" role="alert">
        <div className="app-error-card">
          <h1>Something went wrong</h1>
          <p>
            The app hit an unexpected error. Your saved decks are safe — reloading usually fixes
            it.
          </p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
