export default function Sidebar({ sets, activeId, onSelect, onDelete }) {
  return (
    <aside className="sidebar">
      <h2>Your Sets {sets.length > 0 && <span className="count">{sets.length}</span>}</h2>

      {sets.length === 0 ? (
        <p className="empty-hint">No sets yet. Generate one to get started!</p>
      ) : (
        <ul className="set-list">
          {sets.map((set) => (
            <li
              key={set.id}
              className={set.id === activeId ? 'set-item active' : 'set-item'}
              onClick={() => onSelect(set.id)}
            >
              <div className="set-info">
                <span className="set-topic">{set.topic}</span>
                <span className="set-sub">{set.cards.length} cards</span>
              </div>
              <button
                className="delete-btn"
                title="Delete set"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(set.id)
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
