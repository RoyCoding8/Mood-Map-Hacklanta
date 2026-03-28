import { useState } from 'react'
import { MOODS, POSITIVE_MOODS, STORY_PLACEHOLDERS } from '../constants'
import { getArea } from '../utils'
import './UpdateMoodPanel.css'


export default function UpdateMoodPanel({ pin, onClose, onUpdate }) {
  const [step, setStep] = useState('pick')
  const [newMood, setNewMood] = useState(null)
  const [story, setStory] = useState('')
  const area = getArea(pin.lat)
  const placeholder = STORY_PLACEHOLDERS[pin.id % STORY_PLACEHOLDERS.length]

  function handleMoodPick(mood) {
    const better = POSITIVE_MOODS.includes(mood.label) && !POSITIVE_MOODS.includes(pin.mood)
    if (better) {
      setNewMood(mood)
      setStep('celebrate')
    } else {
      onUpdate(pin.id, mood, null)
    }
  }

  return (
    <div className="update-panel">
      <div className="update-panel-head">
        <div className="update-panel-title">
          {step === 'pick' ? 'Update My Mood' : 'Look at that growth!'}
        </div>
        <button onClick={onClose} aria-label="Close update panel" className="panel-close-btn">✕</button>
      </div>

      {step === 'pick' ? (
        <>
          <div className="update-origin" style={{ '--origin-color': pin.color }}>
            You felt {pin.emoji} <strong>{pin.mood}</strong> at {pin.time} near {area}
          </div>
          <div className="update-prompt">How are you feeling now?</div>
          <div className="update-mood-grid">
            {MOODS.map(mood => (
                <button
                  key={mood.label}
                  onClick={() => handleMoodPick(mood)}
                  className="update-mood-btn ui-btn"
                  style={{ '--mood-color': mood.color, '--mood-bg': `${mood.color}18` }}
                >
                <span className="update-mood-emoji">{mood.emoji}</span>
                <span className="update-mood-label">{mood.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="update-growth-card" style={{ '--from': `${pin.color}18`, '--to': `${newMood.color}18` }}>
            <div className="update-growth-emoji">{pin.emoji} → {newMood.emoji}</div>
            <div className="update-growth-title">You went from {pin.mood} to {newMood.label}!</div>
            <div className="update-growth-subtitle">That's incredible — what helped you turn it around?</div>
          </div>
          <textarea
            value={story}
            onChange={e => setStory(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="update-story-input"
          />
          <div className="update-story-note">Share anonymously · inspires other students · optional</div>
          <div className="update-actions">
            <button
              onClick={() => onUpdate(pin.id, newMood, story.trim() || null)}
              className="update-save-btn ui-btn"
              style={{ '--save-color': newMood.color }}
            >
              {story.trim() ? 'Share & Inspire Others' : 'Update Mood'}
            </button>
            <button
              onClick={() => onUpdate(pin.id, newMood, null)}
              className="update-skip-btn ui-btn"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  )
}
