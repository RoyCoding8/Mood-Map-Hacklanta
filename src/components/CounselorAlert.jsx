import { useState, useEffect } from 'react'
import { ALERT_CONFIG, KNOWN_AREAS } from '../constants'
import './CounselorAlert.css'

export default function CounselorAlert({ vibe, hotspot }) {
  const [sent, setSent] = useState(false)

  useEffect(() => {
    setSent(false)
  }, [vibe])

  const cfg = ALERT_CONFIG[vibe] || ALERT_CONFIG.Stressed
  const loc = KNOWN_AREAS.find(a => hotspot?.includes(a)) || 'campus center'

  return (
    <div
      className="counselor-alert-card"
      style={{
        '--alert-bg': cfg.bg,
        '--alert-border': cfg.border,
        '--alert-color': cfg.color
      }}
    >
      <div className="counselor-alert-label">{cfg.label}</div>
      <div className="counselor-alert-message">{cfg.message(loc)}</div>

      {sent ? (
        <>
          <div className="sent-row">
            <span className="sent-check">✓</span>
            Notification sent to 847 students
          </div>
          <div className="mock-notification">{cfg.notification}</div>
        </>
      ) : (
        <button
          className="alert-action-btn ui-btn"
          onClick={() => setSent(true)}
          style={{ '--action-bg': cfg.color }}
        >
          {cfg.buttonLabel}
        </button>
      )}
    </div>
  )
}
