import './RecoveryFeed.css'

export default function RecoveryFeed({ stories, onHeart }) {
  function timeAgo(ts) {
    const min = Math.floor((Date.now() - ts) / 60000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min} min ago`
    return `${Math.floor(min / 60)} hr ago`
  }

  return (
    <div className="panel-card ui-card">
      <div className="panel-title panel-title-inline">
        Recovery Stories
      </div>
      {stories.length === 0 ? (
        <div className="panel-empty recovery-empty">
          Update one of your mood pins to share your recovery journey anonymously — inspire others
        </div>
      ) : (
        <div className="recovery-list">
          {stories.slice(0, 5).map(s => (
            <div key={s.id} className="story-card">
              <div className="story-head">
                <span className="story-emojis">{s.fromEmoji} → {s.toEmoji}</span>
                <span className="story-time">{timeAgo(s.timestamp)}</span>
              </div>
              <div className="story-area">Near {s.area}</div>
              <div className="story-quote">
                "{s.story}"
              </div>
              <div className="story-actions">
                <button className="heart-btn ui-btn" onClick={() => onHeart(s.id)} aria-label="Heart this recovery story">❤️</button>
                <span className="story-helped">
                  {s.hearts > 0
                    ? `This helped ${s.hearts} ${s.hearts === 1 ? 'person' : 'people'} today`
                    : 'Be the first to find this helpful'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
