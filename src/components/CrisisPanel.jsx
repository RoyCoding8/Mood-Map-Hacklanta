import { useState } from 'react'
import { CRISIS_ACTIONS } from '../constants'
import './CrisisPanel.css'

export default function CrisisPanel({ onDeactivate, onResolution, resolutionActive }) {
  const [confirmed, setConfirmed] = useState(new Set())

  function confirm(i) {
    setConfirmed(prev => new Set([...prev, i]))
  }

  return (
    <div className="crisis-panel-root">
      <div className="crisis-banner">
        <div className="crisis-banner-title">
          <span className="crisis-banner-icon">⚠</span> Elevated stress detected
        </div>
        <div className="crisis-banner-subtext">
          67% of campus reporting negative emotions in the last 30 minutes.
        </div>
      </div>

      <div className="crisis-actions-card">
        <div className="crisis-actions-kicker">Recommended immediate actions</div>
        <div className="crisis-actions-list">
          {CRISIS_ACTIONS.map((action, i) => (
            <div
              key={i}
              className="crisis-action"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="crisis-action-text-row">
                <span className="crisis-action-icon">{action.icon}</span>
                <span>{action.label}</span>
              </div>
              {confirmed.has(i) ? (
                <div className="sent-row crisis-sent-row">
                  <span className="sent-check crisis-sent-check">✓</span>
                  {action.confirm}
                </div>
              ) : (
                <button
                  className="crisis-confirm-btn ui-btn"
                  onClick={() => confirm(i)}
                >
                  Confirm action
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onResolution}
        disabled={resolutionActive}
        className="crisis-resolution-btn ui-btn"
      >
        {resolutionActive ? (
          <span className="resolution-label">Resolution in progress…</span>
        ) : (
          'Activate Resolution Mode'
        )}
      </button>

      <button
        onClick={onDeactivate}
        className="crisis-deactivate-btn ui-btn"
      >
        Deactivate Crisis Mode
      </button>
    </div>
  )
}
