import './MoodJournal.css'

export default function MoodJournal({ userPins, streak, journalSummary, loadingJournal }) {
  return (
    <div className="panel-card ui-card">
      <div className="journal-header-row">
        <div className="panel-title panel-title-inline">
          <span>My Mood Today</span>
        </div>
        {streak.count >= 2 && (
          <div className="journal-streak-chip">
            <span className="streak-fire">🔥</span> {streak.count} day streak
          </div>
        )}
      </div>

      {userPins.length === 0 ? (
        <div className="panel-empty">Click the map to drop your first mood pin today</div>
      ) : (
        <>
          <div className="journal-list">
            {userPins.map(p => (
              <div key={p.id} className="journal-entry journal-entry-row">
                <div
                  className="journal-dot"
                  style={{
                    background: p.color,
                    boxShadow: `0 0 0 3px ${p.color}2a`
                  }}
                />
                <div className="journal-time">{p.time}</div>
                <div className="journal-line-text">
                  {p.emoji} <strong>{p.mood}</strong> near {p.area}
                </div>
              </div>
            ))}
          </div>
          {userPins.length >= 2 && (
            <div className="journal-summary-wrap">
              {loadingJournal ? (
                <div className="journal-loading">
                  <span className="journal-loading-text">reflecting on your day...</span>
                  <div className="typing-dots">
                    <span /><span /><span />
                  </div>
                </div>
              ) : journalSummary ? (
                <div className="journal-summary">{journalSummary}</div>
              ) : null}
            </div>
          )}
          <div className="journal-streak-msg-wrap">
            {streak.count === 1 ? (
              <span className="journal-streak-msg">First check-in today — great start!</span>
            ) : streak.count >= 2 ? (
              <span className="journal-streak-msg journal-streak-msg-hot">
                <span className="streak-fire">🔥</span>
                You've checked in {streak.count} days in a row — self-awareness is a superpower.
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
