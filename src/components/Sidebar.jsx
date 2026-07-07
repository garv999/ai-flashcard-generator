import { TrashIcon } from './Icons.jsx'
import { deckDueCount } from '../services/srs.js'

export default function Sidebar({ sets, activeId, onSelect, onDelete }) {
  const now = Date.now()
  return (
    <aside className="sidebar" aria-label="Saved flashcard sets" data-reveal="left">
      <h2>
        Your Sets
        {sets.length > 0 && <span className="count">{sets.length}</span>}
      </h2>

      {sets.length === 0 ? (
        <p className="empty-hint">No sets yet. Generate one to get started.</p>
      ) : (
        <ul className="set-list">
          {sets.map((set) => {
            const isActive = set.id === activeId
            const due = deckDueCount(set, now)
            return (
              <li
                key={set.id}
                className={isActive ? 'set-item active' : 'set-item'}
              >
                <button
                  type="button"
                  className="set-select"
                  onClick={() => onSelect(set.id)}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className="set-info">
                    <span className="set-topic">
                      {set.topic}
                      {set.source === 'pdf' && <span className="set-badge">PDF</span>}
                    </span>
                    <span className="set-sub">
                      {set.cards.length} card{set.cards.length === 1 ? '' : 's'}
                      {set.source === 'pdf' && set.pageCount
                        ? ` · ${set.pageCount} page${set.pageCount === 1 ? '' : 's'}`
                        : ''}
                      {due > 0 && <span className="set-due">{due} due</span>}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="delete-btn"
                  aria-label={`Delete set: ${set.topic}`}
                  onClick={() => onDelete(set.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
