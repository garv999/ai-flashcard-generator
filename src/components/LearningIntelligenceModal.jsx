import { useEffect, useRef, useMemo } from 'react'
import {
  CloseIcon,
  BrainIcon,
  SparklesIcon,
  AlertIcon,
  RotateIcon,
  TargetIcon,
  CardsIcon,
  MessageIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  TrendUpIcon,
  TrendDownIcon,
} from './Icons.jsx'
import { buildIntelligence } from '../services/intelligence.js'

const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)

function TrendBadge({ trend }) {
  if (!trend || trend.direction === 'no-data') return <span className="li-trend li-trend-flat">No data</span>
  if (trend.direction === 'improving')
    return (
      <span className="li-trend li-trend-up">
        <TrendUpIcon /> {pct(trend.current)}
      </span>
    )
  if (trend.direction === 'declining')
    return (
      <span className="li-trend li-trend-down">
        <TrendDownIcon /> {pct(trend.current)}
      </span>
    )
  return <span className="li-trend li-trend-flat">{pct(trend.current)} steady</span>
}

function Tile({ icon, value, label, accent }) {
  return (
    <div className={`li-tile ${accent ? 'li-tile-accent' : ''}`}>
      <span className="li-tile-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="li-tile-value">{value}</span>
      <span className="li-tile-label">{label}</span>
    </div>
  )
}

function Section({ icon, title, count, children }) {
  return (
    <section className="li-section">
      <h3 className="li-section-title">
        <span className="li-section-icon" aria-hidden="true">
          {icon}
        </span>
        {title}
        {count != null && <span className="li-section-count">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

// The AI Learning Intelligence dashboard. Analyzes spaced-repetition state,
// quiz results, analytics and AI chat interactions to surface weak concepts,
// forgotten topics, predicted gaps, revision priorities, flashcard suggestions
// and personalized insights. Reuses the shared modal shell + scroll handling.
export default function LearningIntelligenceModal({ sets, stats, chats, onClose, onNavigate, onGenerate }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const report = useMemo(
    () => buildIntelligence({ sets, stats, chats, now: Date.now() }),
    [sets, stats, chats],
  )
  const s = report.summary

  const go = (deckId, mode) => {
    if (deckId && onNavigate) onNavigate(deckId, mode)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal li-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="li-title"
        onClick={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        <div className="modal-head">
          <h2 id="li-title">
            <BrainIcon className="li-title-icon" /> Learning Intelligence
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close learning intelligence"
          >
            <CloseIcon />
          </button>
        </div>

        {!report.hasData ? (
          <div className="an-empty">
            <div className="an-empty-art" aria-hidden="true">
              <BrainIcon />
            </div>
            <h3>Not enough data yet</h3>
            <p>
              Review some cards, take a quiz, and chat with the coach. As you study, this dashboard
              will detect your weak concepts, predict what you’ll forget, and recommend what to do next.
            </p>
          </div>
        ) : (
          <>
            {/* Summary tiles */}
            <div className="li-tiles">
              <Tile icon={<TargetIcon />} value={`${s.masteryPct}%`} label="overall mastery" accent />
              <Tile icon={<AlertIcon />} value={s.weakCount} label="weak concepts" />
              <Tile icon={<RotateIcon />} value={s.atRisk} label="at risk of forgetting" />
              <div className="li-tile">
                <span className="li-tile-icon" aria-hidden="true">
                  <ChartIcon />
                </span>
                <TrendBadge trend={s.retentionTrend} />
                <span className="li-tile-label">recall this week</span>
              </div>
            </div>

            {/* Personalized insights */}
            <Section icon={<SparklesIcon />} title="Personalized insights">
              <ul className="li-insights">
                {report.insights.map((text, i) => (
                  <li key={i} className="li-insight">
                    <SparklesIcon className="li-insight-icon" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <div className="li-grid">
              {/* Weak concepts */}
              {report.weakConcepts.length > 0 && (
                <Section icon={<AlertIcon />} title="Weak concepts" count={report.weakConcepts.length}>
                  <ul className="li-list">
                    {report.weakConcepts.map((c) => (
                      <li key={`${c.deckId}-${c.cardIndex}`} className="li-row">
                        <div className="li-row-body">
                          <span className="li-row-title">{c.concept}</span>
                          <span className="li-row-sub">
                            {c.deckTopic} · {c.reasons.join(' · ')}
                          </span>
                        </div>
                        <button type="button" className="li-row-btn" onClick={() => go(c.deckId, 'review')}>
                          Review <ChevronRightIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Frequently forgotten */}
              {report.forgottenTopics.length > 0 && (
                <Section icon={<RotateIcon />} title="Frequently forgotten" count={report.forgottenTopics.length}>
                  <ul className="li-list">
                    {report.forgottenTopics.map((c) => (
                      <li key={`${c.deckId}-${c.cardIndex}`} className="li-row">
                        <div className="li-row-body">
                          <span className="li-row-title">{c.concept}</span>
                          <span className="li-row-sub">
                            {c.deckTopic} · recall {c.ease.toFixed(1)}
                            {c.lapsed ? ' · reset recently' : ''}
                          </span>
                        </div>
                        <button type="button" className="li-row-btn" onClick={() => go(c.deckId, 'review')}>
                          Review <ChevronRightIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            {/* Predicted learning gaps */}
            {report.learningGaps.length > 0 && (
              <Section icon={<TargetIcon />} title="Predicted learning gaps" count={report.learningGaps.length}>
                <ul className="li-list">
                  {report.learningGaps.map((g, i) => (
                    <li key={i} className="li-row li-row-gap">
                      <div className="li-row-body">
                        <span className="li-row-title">{g.title}</span>
                        <span className="li-row-sub">{g.detail}</span>
                      </div>
                      {g.deckId && (
                        <button type="button" className="li-row-btn" onClick={() => go(g.deckId, 'review')}>
                          Review <ChevronRightIcon />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <div className="li-grid">
              {/* Revision priorities */}
              {report.revisionPriorities.length > 0 && (
                <Section icon={<RotateIcon />} title="Revision priorities" count={report.revisionPriorities.length}>
                  <ol className="li-list li-priority">
                    {report.revisionPriorities.map((d, i) => (
                      <li key={d.deckId} className="li-row">
                        <span className="li-rank" aria-hidden="true">
                          {i + 1}
                        </span>
                        <div className="li-row-body">
                          <span className="li-row-title">{d.deckTopic}</span>
                          <span className="li-row-sub">
                            {d.reason} · {d.masteryPct}% mastered
                          </span>
                        </div>
                        <button type="button" className="li-row-btn" onClick={() => go(d.deckId, 'review')}>
                          Review <ChevronRightIcon />
                        </button>
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {/* Recommended flashcards */}
              {report.cardSuggestions.length > 0 && (
                <Section icon={<CardsIcon />} title="Recommended flashcards" count={report.cardSuggestions.length}>
                  <ul className="li-list">
                    {report.cardSuggestions.map((sug, i) => (
                      <li key={i} className="li-row">
                        <div className="li-row-body">
                          <span className="li-row-title">{sug.topic}</span>
                          <span className="li-row-sub">{sug.reason}</span>
                        </div>
                        {onGenerate && (
                          <button
                            type="button"
                            className="li-row-btn li-row-btn-accent"
                            onClick={() => onGenerate(sug.topic)}
                          >
                            <SparklesIcon /> Generate
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>

            {/* AI interaction analysis */}
            {report.aiInteraction.totalQuestions > 0 && (
              <Section icon={<MessageIcon />} title="What you ask about">
                <p className="li-ai-summary">
                  You’ve asked <strong>{report.aiInteraction.totalQuestions}</strong> question
                  {report.aiInteraction.totalQuestions === 1 ? '' : 's'} of the coach
                  {report.aiInteraction.mostDiscussed
                    ? `, most about “${report.aiInteraction.mostDiscussed.topic}”.`
                    : '.'}
                </p>
                {report.aiInteraction.perDeck.length > 0 && (
                  <div className="li-bars">
                    {report.aiInteraction.perDeck.slice(0, 5).map((d) => {
                      const max = report.aiInteraction.perDeck[0].count || 1
                      return (
                        <div key={d.deckId} className="li-bar-row">
                          <span className="li-bar-label" title={d.topic}>
                            {d.topic}
                          </span>
                          <span className="li-bar-track">
                            <span className="li-bar-fill" style={{ width: `${(d.count / max) * 100}%` }} />
                          </span>
                          <span className="li-bar-count">{d.count}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {report.aiInteraction.topTerms.length > 0 && (
                  <div className="li-terms">
                    {report.aiInteraction.topTerms.map((t) => (
                      <span key={t.term} className="li-term">
                        {t.term}
                        <em>{t.count}</em>
                      </span>
                    ))}
                  </div>
                )}
              </Section>
            )}

            <p className="li-foot">
              <CheckIcon /> Insights update automatically as you study — recomputed from your live progress.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
