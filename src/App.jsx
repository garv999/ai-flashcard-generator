import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import TopicForm from './components/TopicForm.jsx'
import PdfUpload from './components/PdfUpload.jsx'
import Sidebar from './components/Sidebar.jsx'
import StudyView from './components/StudyView.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import AuthModal from './components/AuthModal.jsx'
import { AlertIcon, LogInIcon } from './components/Icons.jsx'
import { generateFlashcards, generateFlashcardsFromContent } from './services/aiService.js'
import { useAuth } from './hooks/useAuth.js'
import {
  subscribeToDecks,
  saveDeck,
  deleteDeck,
  migrateLocalDecks,
} from './services/decks.js'
import {
  loadSets,
  saveSets,
  clearSets,
  loadSettings,
  saveSettings,
  makeId,
} from './utils/storage.js'

function LoadingState({ label = 'Generating your flashcards…' }) {
  return (
    <div className="loading-state" aria-busy="true" aria-live="polite">
      <div className="loading-head">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-pill" />
      </div>
      <div className="skeleton skeleton-card">
        <div className="spinner" />
        <p className="loading-label">{label}</p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, authReady, logout } = useAuth()

  const [sets, setSets] = useState([])
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false) // card generation in-flight
  const [genProgress, setGenProgress] = useState('') // progress label during generation
  const [decksLoading, setDecksLoading] = useState(false) // cloud decks loading
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authBusy, setAuthBusy] = useState(false) // logout in-flight

  // Settings stay device-local (they hold the provider + API key).
  useEffect(() => saveSettings(settings), [settings])

  // Load decks from the right source based on auth state.
  useEffect(() => {
    if (!authReady) return

    // --- Demo mode: localStorage ---
    if (!user) {
      const local = loadSets()
      setSets(local)
      setActiveId(local[0]?.id ?? null)
      setDecksLoading(false)
      return
    }

    // --- Signed in: migrate once, then subscribe to Firestore (realtime) ---
    let cancelled = false
    let unsubscribe = () => {}
    setDecksLoading(true)

    ;(async () => {
      try {
        const local = loadSets()
        if (local.length) {
          await migrateLocalDecks(user.uid, local)
          clearSets() // migrated data lives in Firestore now
        }
      } catch (err) {
        console.error('[Flashcards] Deck migration failed:', err)
      }
      if (cancelled) return

      unsubscribe = subscribeToDecks(
        user.uid,
        (decks) => {
          setSets(decks)
          setDecksLoading(false)
          // Keep the current selection if it still exists, else pick the first.
          setActiveId((cur) =>
            cur && decks.some((d) => d.id === cur) ? cur : decks[0]?.id ?? null,
          )
        },
        () => setDecksLoading(false),
      )
    })()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [user, authReady])

  // Demo-mode persistence: mirror decks to localStorage while logged out.
  useEffect(() => {
    if (authReady && !user) saveSets(sets)
  }, [sets, user, authReady])

  const activeSet = sets.find((s) => s.id === activeId) ?? null

  // Persist a freshly-generated deck to Firestore (signed in) or local state (demo).
  async function persistNewDeck(newSet) {
    if (user) {
      await saveDeck(user.uid, newSet) // realtime listener adds it to `sets`
      setActiveId(newSet.id)
    } else {
      setSets((prev) => [newSet, ...prev])
      setActiveId(newSet.id)
    }
  }

  async function handleGenerate(topic) {
    setLoading(true)
    setError('')
    try {
      const cards = await generateFlashcards(topic, settings)
      if (!cards.length) throw new Error('No cards were generated. Try a different topic.')
      await persistNewDeck({
        id: makeId(),
        topic,
        cards,
        createdAt: new Date().toISOString(),
        source: 'topic',
      })
    } catch (err) {
      setError(err.message || 'Something went wrong while generating cards.')
    } finally {
      setLoading(false)
    }
  }

  // Generate a deck from extracted PDF content. Returns true on success so the
  // PdfUpload panel can reset itself.
  async function handleGeneratePdf(content, meta) {
    setLoading(true)
    setError('')
    setGenProgress('')
    try {
      const cards = await generateFlashcardsFromContent(content, settings, {
        onProgress: ({ current, total }) =>
          setGenProgress(
            total > 1 ? `Generating cards… section ${current} of ${total}` : 'Generating cards…',
          ),
      })
      if (!cards.length) throw new Error('No cards were generated from this PDF.')
      const title = meta.filename.replace(/\.pdf$/i, '')
      await persistNewDeck({
        id: makeId(),
        topic: title,
        cards,
        createdAt: new Date().toISOString(),
        source: 'pdf',
        filename: meta.filename,
        pageCount: meta.pageCount,
        uploadDate: meta.uploadDate,
        ...(meta.pageRange ? { pageRange: meta.pageRange } : {}),
      })
      return true
    } catch (err) {
      setError(err.message || 'Something went wrong while generating from the PDF.')
      return false
    } finally {
      setLoading(false)
      setGenProgress('')
    }
  }

  async function handleDelete(id) {
    if (user) {
      try {
        await deleteDeck(user.uid, id)
        // The realtime listener recomputes `sets` and `activeId`.
      } catch (err) {
        console.error('[Flashcards] Failed to delete deck:', err)
        setError('Could not delete that deck. Please try again.')
      }
    } else {
      setSets((prev) => {
        const remaining = prev.filter((s) => s.id !== id)
        if (id === activeId) setActiveId(remaining[0]?.id ?? null)
        return remaining
      })
    }
  }

  async function handleLogout() {
    setAuthBusy(true)
    try {
      await logout()
    } catch (err) {
      console.error('[Flashcards] Logout failed:', err)
    } finally {
      setAuthBusy(false)
    }
  }

  // Wait for Firebase to resolve the initial auth state before rendering the app.
  if (!authReady) {
    return (
      <div className="app auth-boot" aria-busy="true" aria-live="polite">
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="app">
      <Header
        provider={settings.provider}
        onOpenSettings={() => setShowSettings(true)}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onLogout={handleLogout}
        authBusy={authBusy}
      />

      <main className="main">
        <Sidebar sets={sets} activeId={activeId} onSelect={setActiveId} onDelete={handleDelete} />

        <div className="content">
          <PdfUpload onGenerate={handleGeneratePdf} loading={loading} />

          <TopicForm onGenerate={handleGenerate} loading={loading} />

          {!user && (
            <div className="banner demo-hint" role="note">
              <span className="demo-hint-text">
                <span>
                  <strong>Demo mode.</strong> Decks are saved only in this browser.
                </span>
              </span>
              <button className="demo-hint-btn" onClick={() => setShowAuth(true)}>
                <LogInIcon style={{ width: 15, height: 15, verticalAlign: '-3px', marginRight: 6 }} />
                Sign in to sync
              </button>
            </div>
          )}

          {error && (
            <div className="banner error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <LoadingState label={genProgress || undefined} />
          ) : decksLoading ? (
            <LoadingState label="Loading your decks…" />
          ) : (
            <StudyView set={activeSet} />
          )}
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      <footer className="footer">
        {user
          ? `Signed in as ${user.displayName || user.email} · Decks synced to the cloud`
          : 'Demo mode · Flashcards saved locally in your browser'}
      </footer>
    </div>
  )
}
