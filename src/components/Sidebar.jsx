import { TrashIcon } from './Icons.jsx'

export default function Sidebar({ sets, activeId, onSelect, onDelete }) {
  return (
    <aside className="sidebar" aria-label="Saved flashcard sets">
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
                    <span className="set-topic">{set.topic}</span>
                    <span className="set-sub">
                      {set.cards.length} card{set.cards.length === 1 ? '' : 's'}
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
