import { useState, useEffect } from 'react'
import Header from './components/Header.jsx'
import TopicForm from './components/TopicForm.jsx'
import Sidebar from './components/Sidebar.jsx'
import StudyView from './components/StudyView.jsx'
import SettingsModal from './components/SettingsModal.jsx'
import { AlertIcon } from './components/Icons.jsx'
import { generateFlashcards } from './services/aiService.js'
import {
  loadSets,
  saveSets,
  loadSettings,
  saveSettings,
  makeId,
} from './utils/storage.js'

function LoadingState() {
  return (
    <div className="loading-state" aria-busy="true" aria-live="polite">
      <div className="loading-head">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-pill" />
      </div>
      <div className="skeleton skeleton-card">
        <div className="spinner" />
        <p className="loading-label">Generating your flashcards…</p>
      </div>
    </div>
  )
}

export default function App() {
  const [sets, setSets] = useState(loadSets)
  const [settings, setSettings] = useState(loadSettings)
  const [activeId, setActiveId] = useState(() => loadSets()[0]?.id ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  // Persist sets and settings whenever they change.
  useEffect(() => saveSets(sets), [sets])
  useEffect(() => saveSettings(settings), [settings])

  const activeSet = sets.find((s) => s.id === activeId) ?? null

  async function handleGenerate(topic) {
    setLoading(true)
    setError('')
    try {
      const cards = await generateFlashcards(topic, settings)
      if (!cards.length) throw new Error('No cards were generated. Try a different topic.')
      const newSet = {
        id: makeId(),
        topic,
        cards,
        createdAt: new Date().toISOString(),
      }
      setSets((prev) => [newSet, ...prev])
      setActiveId(newSet.id)
    } catch (err) {
      setError(err.message || 'Something went wrong while generating cards.')
    } finally {
      setLoading(false)
    }
  }

  function handleDelete(id) {
    setSets((prev) => {
      const remaining = prev.filter((s) => s.id !== id)
      if (id === activeId) setActiveId(remaining[0]?.id ?? null)
      return remaining
    })
  }

  return (
    <div className="app">
      <Header provider={settings.provider} onOpenSettings={() => setShowSettings(true)} />

      <main className="main">
        <Sidebar
          sets={sets}
          activeId={activeId}
          onSelect={setActiveId}
          onDelete={handleDelete}
        />

        <div className="content">
          <TopicForm onGenerate={handleGenerate} loading={loading} />

          {error && (
            <div className="banner error" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          {loading ? <LoadingState /> : <StudyView set={activeSet} />}
        </div>
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <footer className="footer">
        Built with React + Vite · Flashcards saved locally in your browser
      </footer>
    </div>
  )
}
