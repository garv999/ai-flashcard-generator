import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import Ambient from './components/Ambient.jsx'
import CinematicHero from './components/CinematicHero.jsx'
import HeroStats from './components/HeroStats.jsx'
import TopicForm from './components/TopicForm.jsx'
import PdfUpload from './components/PdfUpload.jsx'
import Sidebar from './components/Sidebar.jsx'
import StudyView from './components/StudyView.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import AuthModal from './components/AuthModal.jsx'
import AnalyticsModal from './components/AnalyticsModal.jsx'
import LearningIntelligenceModal from './components/LearningIntelligenceModal.jsx'
import { AlertIcon, LogInIcon, CloseIcon } from './components/Icons.jsx'
import { generateFlashcards, generateFlashcardsFromContent } from './services/aiService.js'
import { schedule } from './services/srs.js'
import { foldQuizResult } from './services/quiz.js'
import {
  loadLocalChats,
  loadAllChats,
  clearLocalChats,
  migrateLocalChats,
  deleteLocalChat,
  deleteChat,
} from './services/chat.js'
import { recordReview, loadLocalStats, saveLocalStats } from './services/analytics.js'
import {
  createAndSaveIndex,
  deleteIndex,
  migrateLocalIndexes,
  clearLocalIndexes,
} from './services/retrieval.js'
import { useAuth } from './hooks/useAuth.js'
import useBackgroundParallax from './hooks/useBackgroundParallax.js'
import useSmoothScroll from './hooks/useSmoothScroll.js'
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
  useBackgroundParallax()
  const { scrollTo } = useSmoothScroll()

  const [sets, setSets] = useState([])
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(false) // card generation in-flight
  const [genProgress, setGenProgress] = useState('') // progress label during generation
  const [decksLoading, setDecksLoading] = useState(false) // cloud decks loading
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showIntelligence, setShowIntelligence] = useState(false)
  const [insightChats, setInsightChats] = useState({}) // conversations for AI-interaction analysis
  const [authBusy, setAuthBusy] = useState(false) // logout in-flight
  const [stats, setStats] = useState(loadLocalStats) // study analytics (device-local)
  const [cloudWarning, setCloudWarning] = useState(false) // cloud sync degraded
  const [coachNav, setCoachNav] = useState(null) // study-coach navigation request

  // Settings stay device-local (they hold the provider + API key).
  useEffect(() => saveSettings(settings), [settings])

  // Study analytics are kept on this device.
  useEffect(() => {
    saveLocalStats(stats)
  }, [stats])

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
        const localChats = loadLocalChats()
        if (Object.keys(localChats).length) {
          await migrateLocalChats(user.uid, localChats)
          clearLocalChats() // conversations now live in Firestore
        }
        const migratedIndexes = await migrateLocalIndexes(user.uid)
        if (migratedIndexes) clearLocalIndexes() // retrieval indexes now in Firestore
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

  // Persist a freshly-generated deck. The deck is shown immediately either way,
  // so a backend hiccup (e.g. a cloud permission error) never loses the user's
  // work — signed-in users just get a soft "saved on this device" notice.
  async function persistNewDeck(newSet) {
    setSets((prev) => (prev.some((d) => d.id === newSet.id) ? prev : [newSet, ...prev]))
    setActiveId(newSet.id)
    if (user) {
      try {
        await saveDeck(user.uid, newSet) // realtime listener reconciles on success
      } catch (err) {
        console.error('[Flashcards] Cloud save failed; deck kept on this device:', err)
        setCloudWarning(true)
      }
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
      const deckId = makeId()
      const newDeck = {
        id: deckId,
        topic: title,
        cards,
        createdAt: new Date().toISOString(),
        source: 'pdf',
        filename: meta.filename,
        pageCount: meta.pageCount,
        uploadDate: meta.uploadDate,
        ...(meta.pageRange ? { pageRange: meta.pageRange } : {}),
      }
      await persistNewDeck(newDeck)

      // Build a retrieval (RAG) index from the same source text so the AI can
      // understand the whole document — not just the generated cards. Best-effort:
      // a failure here never blocks deck creation.
      try {
        setGenProgress('Indexing document for AI…')
        const marker = await createAndSaveIndex({ deckId, text: content, settings, user })
        if (marker) {
          const withRag = { ...newDeck, rag: marker }
          setSets((prev) => prev.map((d) => (d.id === deckId ? withRag : d)))
          if (user) await saveDeck(user.uid, withRag).catch(() => {})
        }
      } catch (err) {
        console.warn('[Flashcards] Could not build retrieval index:', err?.message || err)
      }
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
        deleteChat(user.uid, id).catch(() => {}) // best-effort chat cleanup
        deleteIndex({ deckId: id, user }).catch(() => {}) // best-effort index cleanup
      } catch (err) {
        console.error('[Flashcards] Failed to delete deck:', err)
        setError('Could not delete that deck. Please try again.')
      }
    } else {
      deleteLocalChat(id) // drop the deck's conversation too
      deleteIndex({ deckId: id, user: null }).catch(() => {}) // and its retrieval index
      setSets((prev) => {
        const remaining = prev.filter((s) => s.id !== id)
        if (id === activeId) setActiveId(remaining[0]?.id ?? null)
        return remaining
      })
    }
  }

  // Record a spaced-repetition rating for one card and persist the new schedule.
  // Updates local state optimistically; signed-in users also write to Firestore.
  async function handleRateCard(deckId, cardIndex, rating) {
    const now = Date.now()
    const deck = sets.find((d) => d.id === deckId)
    if (!deck || !deck.cards[cardIndex]) return
    const cards = deck.cards.map((c, i) =>
      i === cardIndex ? { ...c, srs: schedule(c, rating, now) } : c,
    )
    const updatedDeck = { ...deck, cards }
    setSets((prev) => prev.map((d) => (d.id === deckId ? updatedDeck : d)))
    // Log the review for study analytics (streaks, retention, activity).
    setStats((prev) => recordReview(prev, rating, now))
    if (user) {
      try {
        await saveDeck(user.uid, updatedDeck)
      } catch (err) {
        console.error('[Flashcards] Failed to save review progress:', err)
        setCloudWarning(true)
      }
    }
  }

  // Persist a finished quiz attempt onto its deck (best score + last attempt).
  // Rides the same deck-persistence path as reviews: optimistic local update,
  // plus a Firestore write for signed-in users.
  async function handleSaveQuizResult(deckId, attempt) {
    const deck = sets.find((d) => d.id === deckId)
    if (!deck) return
    const quiz = foldQuizResult(deck.quiz, attempt)
    const updatedDeck = { ...deck, quiz }
    setSets((prev) => prev.map((d) => (d.id === deckId ? updatedDeck : d)))
    if (user) {
      try {
        await saveDeck(user.uid, updatedDeck)
      } catch (err) {
        console.error('[Flashcards] Failed to save quiz result:', err)
        setCloudWarning(true)
      }
    }
  }

  // Persist (or clear) a deck's study-plan config. Only the lightweight config
  // rides on the deck; the day-by-day schedule is derived live from card state.
  // Passing `config = null` removes the plan. Same persistence path as reviews.
  async function handleSavePlan(deckId, config) {
    const deck = sets.find((d) => d.id === deckId)
    if (!deck) return
    const updatedDeck = { ...deck }
    if (config) updatedDeck.plan = config
    else delete updatedDeck.plan
    setSets((prev) => prev.map((d) => (d.id === deckId ? updatedDeck : d)))
    if (user) {
      try {
        await saveDeck(user.uid, updatedDeck)
      } catch (err) {
        console.error('[Flashcards] Failed to save study plan:', err)
        setCloudWarning(true)
      }
    }
  }

  // Act on a study-coach recommendation: focus the target deck and ask
  // StudyView to switch to the recommended mode (review / quiz / plan / browse).
  // The nonce lets the same recommendation fire more than once.
  function handleCoachAction(deckId, mode) {
    if (!deckId) return
    setActiveId(deckId)
    setCoachNav((prev) => ({ deckId, mode, n: (prev?.n || 0) + 1 }))
  }

  // Open the Learning Intelligence dashboard. Conversations power the AI-
  // interaction analysis: loaded from localStorage (Demo) or Firestore (signed
  // in). The dashboard renders immediately; chat data fills in when it arrives.
  function openIntelligence() {
    setInsightChats(user ? {} : loadLocalChats())
    setShowIntelligence(true)
    if (user) loadAllChats(user.uid).then(setInsightChats).catch(() => {})
  }

  // Navigate from the dashboard to a deck's study mode (reuses the coach path).
  function handleInsightNavigate(deckId, mode) {
    handleCoachAction(deckId, mode)
    setShowIntelligence(false)
  }

  // Act on a "recommended flashcards" suggestion: close the dashboard and
  // generate a focused deck on that topic via the existing generation flow.
  function handleInsightGenerate(topic) {
    setShowIntelligence(false)
    handleGenerate(topic)
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
        <Ambient />
        <div className="spinner" />
      </div>
    )
  }

  return (
    <>
      <CinematicHero onGetStarted={() => scrollTo('#workspace')} />
      <div className="app" id="workspace">
      <Ambient />
      <Header
        provider={settings.provider}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAnalytics={() => setShowAnalytics(true)}
        onOpenIntelligence={openIntelligence}
        user={user}
        onSignIn={() => setShowAuth(true)}
        onLogout={handleLogout}
        authBusy={authBusy}
      />

      <HeroStats sets={sets} />

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

          {cloudWarning && (
            <div className="banner warn" role="status">
              <AlertIcon />
              <span>
                Cloud sync is unavailable right now — your decks and progress are being saved on
                this device.
              </span>
              <button
                type="button"
                className="banner-dismiss"
                onClick={() => setCloudWarning(false)}
                aria-label="Dismiss"
              >
                <CloseIcon />
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
            <StudyView
              set={activeSet}
              sets={sets}
              stats={stats}
              onRate={handleRateCard}
              onSaveQuizResult={handleSaveQuizResult}
              onSavePlan={handleSavePlan}
              onCoachAction={handleCoachAction}
              coachNav={coachNav}
              user={user}
              settings={settings}
            />
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

      {showAnalytics && (
        <AnalyticsModal
          sets={sets}
          stats={stats}
          onClose={() => setShowAnalytics(false)}
        />
      )}

      {showIntelligence && (
        <LearningIntelligenceModal
          sets={sets}
          stats={stats}
          chats={insightChats}
          onNavigate={handleInsightNavigate}
          onGenerate={handleInsightGenerate}
          onClose={() => setShowIntelligence(false)}
        />
      )}

      <footer className="footer">
        {user
          ? `Signed in as ${user.displayName || user.email} · Decks synced to the cloud`
          : 'Demo mode · Flashcards saved locally in your browser'}
      </footer>
      </div>
    </>
  )
}
