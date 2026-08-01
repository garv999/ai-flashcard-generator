import { useEffect, useRef, useState } from 'react'
import { rankDeckIds } from '../services/semanticSearch.js'

// Drives semantic deck ranking for the dashboard search.
//
// Returns { matchIds, loading, failed }:
//   - matchIds: ordered array of deck ids (best-first) when a semantic query is
//     active; null otherwise (caller then uses keyword filtering).
//   - loading: a ranking pass is in flight.
//   - failed: the pass errored — the caller should fall back to keyword search.
//
// The query is debounced, and each new query aborts the previous pass. Embedding
// itself is cached in the service layer, so repeat queries are fast.
export default function useSemanticSearch(query, active, sets, settings) {
  const [matchIds, setMatchIds] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const abortRef = useRef(null)

  const q = (query || '').trim()

  useEffect(() => {
    // Not in semantic mode, or empty query → no semantic filter.
    if (!active || !q) {
      setMatchIds(null)
      setLoading(false)
      setFailed(false)
      abortRef.current?.abort()
      return
    }

    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    setLoading(true)
    setFailed(false)

    const t = setTimeout(async () => {
      try {
        const ids = await rankDeckIds(q, sets, settings, { signal: controller.signal })
        if (!controller.signal.aborted) {
          setMatchIds(ids)
          setLoading(false)
        }
      } catch {
        if (!controller.signal.aborted) {
          setFailed(true)
          setMatchIds(null)
          setLoading(false)
        }
      }
    }, 220)

    return () => {
      clearTimeout(t)
      controller.abort()
    }
    // sets/settings are read at call time; re-running on every deck edit would be
    // wasteful, so we key on the query + mode and the deck count/signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, active, sets.length, settings?.provider])

  return { matchIds, loading, failed }
}
