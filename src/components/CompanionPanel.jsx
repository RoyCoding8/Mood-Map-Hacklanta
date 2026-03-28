import { useState, useEffect, useRef, useMemo } from 'react'
import { POSITIVE_MOODS } from '../constants'
import { detectLevel } from '../utils'
import { getAIComfort, getAIChat } from '../api'
import CrisisCard from './CrisisCard'
import './CompanionPanel.css'

export default function CompanionPanel({ mood, color, onClose, onFeelBetter, extras = {},
  onEmergency, onSafeConfirmed, onMakeHappyPlace, happyPlaces = [], onShowHappyPlace, prefersReducedMotion = false }) {
  const [comfort, setComfort] = useState(null)
  const [typing, setTyping] = useState(true)
  // showCrisisCard is set true when either the comfort or chat AI endpoint
  // returns requiresEscalation: true — distinct from the L3 physical-danger overlay.
  const [showCrisisCard, setShowCrisisCard] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatTyping, setChatTyping] = useState(false)
  const [emergencyLevel, setEmergencyLevel] = useState(0)
  const emergencyLevelRef = useRef(0)
  const [comfortError, setComfortError] = useState(false)
  const [helpNowQuestion, setHelpNowQuestion] = useState(false)
  const msgTimestampsRef = useRef([])
  const [happyPlaceDecided, setHappyPlaceDecided] = useState(false)
  const [madeHappyPlace, setMadeHappyPlace] = useState(false)
  const [listening, setListening] = useState(false)
  const [readAloud, setReadAloud] = useState(false)
  const chatEndRef = useRef(null)
  const recognitionRef = useRef(null)
  const isPositive = POSITIVE_MOODS.includes(mood)
  const activeHappyPlaces = happyPlaces.filter(p => !p.expired)
  const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const getContrastText = hex => {
    const raw = hex?.replace('#', '') || ''
    const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw
    if (full.length !== 6) return '#111827'
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    return luminance > 0.58 ? '#111827' : '#f8fafc'
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableExtras = useMemo(() => extras, [extras.timeOfDay, extras.pinNumber, extras.randomSeed])

  useEffect(() => {
    setComfortError(false)
    getAIComfort(mood, stableExtras).then(data => {
      setComfort(data)
      setTyping(false)
      // Backend signals a potential crisis — show crisis card instead of comfort content
      if (data?.requiresEscalation === true) setShowCrisisCard(true)
    }).catch(() => {
      setComfortError(true)
      setComfort({
        message: "I'm here with you. Whatever you're feeling right now is valid.",
        action: "Take three slow, deep breaths.",
        joke: "Why do we tell actors to 'break a leg?' Because every play has a cast 😄",
        reminder: "You showed up today. That already takes courage.",
        musicVibes: null,
        recoveryPrompt: null
      })
      setTyping(false)
    })
  }, [mood, stableExtras])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' })
  }, [chatHistory, chatTyping, prefersReducedMotion])

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('')
      setChatInput(transcript)
    }
    rec.onend = () => { setListening(false); recognitionRef.current = null }
    rec.onerror = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  function speakText(text) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 0.92
    utter.pitch = 1.05
    const setVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      const warm = voices.find(v =>
        v.lang.startsWith('en') &&
        /samantha|karen|moira|zira|female|victoria/i.test(v.name)
      ) || voices.find(v => v.lang.startsWith('en')) || null
      if (warm) utter.voice = warm
      window.speechSynthesis.speak(utter)
    }
    if (window.speechSynthesis.getVoices().length > 0) setVoice()
    else { window.speechSynthesis.onvoiceschanged = setVoice }
  }

  async function sendChat() {
    if (!chatInput.trim()) return
    const msg = chatInput.trim()
    setChatInput('')
    setChatHistory(h => [...h, { from: 'user', text: msg }])

    const now = Date.now()
    msgTimestampsRef.current = [...msgTimestampsRef.current, now]
      .filter(t => now - t < 60000)
    const recentCount = msgTimestampsRef.current.length

    const msgLevel = detectLevel(msg)

    const prev = emergencyLevelRef.current
    let effectiveLevel
    if (recentCount >= 3 && prev >= 1) {
      effectiveLevel = Math.min(3, Math.max(msgLevel, prev + 1))
    } else {
      effectiveLevel = Math.max(msgLevel, prev)
    }
    setEmergencyLevel(effectiveLevel)
    emergencyLevelRef.current = effectiveLevel

    if (effectiveLevel >= 3) {
      onEmergency?.()
      setChatHistory(h => [...h, {
        from: 'ai',
        text: "This sounds serious. Your safety comes first. Please call 911 or Campus Police immediately. If you cannot call, text 911 in Georgia. Stay in a lit public area. I am here with you.",
        lvl: 3
      }])
      return
    }

    if (effectiveLevel === 2) {
      setChatHistory(h => [...h, {
        from: 'ai',
        text: "I want to make sure you're okay. Are you in a safe place right now? If you feel physically threatened at any point, please don't hesitate to call Campus Police or 911.",
        lvl: 2
      }])
      return
    }

    setChatTyping(true)
    try {
      const data = await getAIChat(mood, msg)

      // Backend semantic detection caught a crisis signal the keyword list missed
      if (data?.requiresEscalation === true) {
        setShowCrisisCard(true)
        setChatHistory(h => [...h, {
          from: 'ai',
          text: 'Your wellbeing matters most. Please reach out using the resources below.',
          lvl: effectiveLevel,
        }])
        setChatTyping(false)
        return
      }

      const { reply } = data
      setChatHistory(h => [...h, { from: 'ai', text: reply, lvl: effectiveLevel }])
      if (readAloud) speakText(reply)
    } catch {
      const fallback = "I'm still here. Tell me more."
      setChatHistory(h => [...h, { from: 'ai', text: fallback, lvl: effectiveLevel }])
      if (readAloud) speakText(fallback)
    }
    setChatTyping(false)
  }

  function handleSafe() {
    setEmergencyLevel(0)
    emergencyLevelRef.current = 0
    setHelpNowQuestion(false)
    onSafeConfirmed?.()
    setChatHistory(h => [...h, {
      from: 'ai',
      text: "I'm so glad you're safe. Would you like to keep talking? I'm here.",
      lvl: 0
    }])
  }

  const bg = isPositive
    ? 'color-mix(in srgb, var(--success-bg) 65%, var(--surface-1))'
    : 'color-mix(in srgb, var(--danger-bg) 60%, var(--surface-1))'
  const border = `2px solid ${color}33`
  const bubbleStyle = {
    '--bubble-user': color,
    '--bubble-user-text': getContrastText(color),
  }

  return (
    <div className="companion-panel" style={{ borderTop: `4px solid ${color}`, ...bubbleStyle }}>
      {emergencyLevel >= 3 && (
        <div className="emergency-overlay">
          <div className="emergency-box">
            <div className="emergency-title">ARE YOU IN IMMEDIATE DANGER?</div>
            <div className="emergency-btns">
              <a href="tel:911" className="emergency-btn emergency-btn-911 ui-btn">
                CALL 911
              </a>
              <a href="tel:+14044135717" className="emergency-btn emergency-btn-police ui-btn">
                CALL GSU CAMPUS POLICE
              </a>
              <button className="emergency-btn emergency-btn-safe ui-btn" onClick={handleSafe}>
                ✓ I AM SAFE — False Alarm
              </button>
            </div>
            <div className="emergency-location-note">
              Your location has been flagged on the map.<br />
              Stay in a visible public area if possible.
            </div>
          </div>
        </div>
      )}
      <div className="companion-head">
        <div className="companion-head-left">
          <span className="companion-head-emoji">{isPositive ? '🌟' : '🤗'}</span>
          <span className="companion-head-title">
            {isPositive ? 'Your vibe is amazing!' : 'Hey, I got you.'}
          </span>
        </div>
        <button onClick={onClose} aria-label="Close companion panel" className="panel-close-btn">✕</button>
      </div>

      {typing ? (
        <div className="companion-typing-row">
          <span className="companion-typing-label">typing</span>
          <div className="typing-dots">
            <span style={{ background: color }} /><span style={{ background: color }} /><span style={{ background: color }} />
          </div>
        </div>
      ) : comfort && (
        <>
          {/* Crisis escalation — replaces all comfort content with hardcoded resources */}
          {showCrisisCard ? (
            <CrisisCard onDismiss={() => setShowCrisisCard(false)} />
          ) : (
          <>
          {comfortError && (
            <div className="companion-error-box">
              Couldn’t reach the AI — showing a fallback message
            </div>
          )}
          <div className="companion-main-message" style={{ background: bg, border }}>
            {comfort.message}
          </div>

          <div className="companion-joke-box">
            {comfort.joke}
          </div>

          <div className="companion-action-row">
            <div className="companion-action-text">
              <strong>Right now:</strong> {comfort.action}
            </div>
          </div>

          <div className="companion-reminder" style={{ borderLeft: `3px solid ${color}` }}>
            {comfort.reminder}
          </div>

          {comfort.musicVibes && (
            <div className="companion-music-row">
              <div className="companion-action-text">
                <strong>Right now:</strong> {comfort.musicVibes}
              </div>
            </div>
          )}

          {comfort.recoveryPrompt && (
            <div className="companion-recovery-prompt">
              {comfort.recoveryPrompt}
            </div>
          )}

          {isPositive ? (
            <div className="companion-button-stack">
              <button onClick={onClose} className="companion-primary-btn ui-btn" style={{ '--companion-btn': color }}>
                Keep spreading good vibes
              </button>

              {!happyPlaceDecided && (
                <div className="happy-place-prompt">
                  <div className="happy-prompt-title">
                    Make this a Happy Place?
                  </div>
                  <div className="happy-prompt-copy">
                    Invite others who are struggling to come find your good energy here.
                  </div>
                  <div className="happy-prompt-actions">
                    <button
                      onClick={() => { setHappyPlaceDecided(true); setMadeHappyPlace(true); onMakeHappyPlace?.() }}
                      className="happy-prompt-yes ui-btn"
                    >
                      Yes, open this spot
                    </button>
                    <button
                      onClick={() => setHappyPlaceDecided(true)}
                      className="happy-prompt-no ui-btn"
                    >
                      Keep private
                    </button>
                  </div>
                </div>
              )}
              {madeHappyPlace && (
                <div className="happy-created-box">
                  Happy Place created! Others can now see your spot and join your energy.
                </div>
              )}
            </div>
          ) : (
            <div className="companion-button-stack">
              {activeHappyPlaces.length > 0 && (
                <div className="nearby-happy-places">
                  <div className="nearby-happy-title">
                    You don't have to be alone right now.
                  </div>
                  <div className="nearby-happy-copy">
                    There are Happy Places nearby where people are gathered and welcoming company.
                  </div>
                  <div className="nearby-happy-list">
                    {activeHappyPlaces.slice(0, 3).map(place => (
                      <div key={place.id} className="nearby-happy-row">
                        <span className="nearby-happy-row-text">
                          😊 <strong>near {place.area}</strong> — {place.count} {place.count === 1 ? 'person' : 'people'}
                        </span>
                        <button
                          onClick={() => onShowHappyPlace?.(place)}
                          className="nearby-happy-btn ui-btn"
                        >
                          Show me
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!showChat && (
                <button onClick={() => setShowChat(true)} className="companion-outline-btn ui-btn" style={{ '--companion-btn': color }}>
                  Talk to me
                </button>
              )}
              <button onClick={onFeelBetter} className="companion-primary-btn ui-btn" style={{ '--companion-btn': color }}>
                I feel a bit better
              </button>
            </div>
          )}

          {showChat && (
            <div className="companion-chat-wrap">
              <div className="companion-chat-toprow">
                <div className="companion-chat-privacy">
                  Anonymous — nothing is saved
                </div>
                <button
                  onClick={() => { if (readAloud) window.speechSynthesis?.cancel(); setReadAloud(r => !r) }}
                  title={readAloud ? 'Turn off read aloud' : 'Read AI replies aloud'}
                  className="companion-audio-toggle"
                  style={{ '--audio-color': color, '--audio-on': readAloud ? `${color}18` : 'transparent' }}
                >
                  {readAloud ? '🔊' : '🔇'} <span className="companion-audio-state">{readAloud ? 'On' : 'Off'}</span>
                </button>
              </div>
              {emergencyLevel === 2 && (
                <div className="emergency-l2-banner">
                  If you need help: <strong>Campus Police 404-413-5717</strong>
                </div>
              )}
              <div className="companion-chat-log">
                {chatHistory.length === 0 && (
                  <div className="companion-chat-empty">
                    Tell me what's on your mind...
                  </div>
                )}
                {chatHistory.map((m, i) => (
                  <div key={i} className={`chat-row ${m.from === 'user' ? 'chat-row-user' : 'chat-row-ai'}`}>
                    <div className={`chat-bubble ${m.from === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                      {m.text}
                    </div>
                    {m.from === 'ai' && emergencyLevel >= 1 && (
                      <button
                        className="emergency-tap-link"
                        onClick={() => { setEmergencyLevel(3); onEmergency?.() }}
                      >
                        Need emergency help? Tap here
                      </button>
                    )}
                  </div>
                ))}
                {chatTyping && (
                  <div className="chat-typing-bubble">
                    <div className="typing-dots"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              {emergencyLevel === 2 && !helpNowQuestion && (
                <button
                  className="help-now-btn ui-btn"
                  onClick={() => setHelpNowQuestion(true)}
                >
                  I need help now
                </button>
              )}
              {emergencyLevel === 2 && helpNowQuestion && (
                <div className="help-now-question">
                  <div className="help-now-question-copy">
                    Are you in immediate physical danger right now?
                  </div>
                  <div className="help-now-actions">
                    <button
                      className="help-now-yes ui-btn"
                      onClick={() => { setEmergencyLevel(3); setHelpNowQuestion(false); onEmergency?.() }}
                    >
                      YES, I need help
                    </button>
                    <button
                      className="help-now-no ui-btn"
                      onClick={() => {
                        setHelpNowQuestion(false)
                        setChatHistory(h => [...h, {
                          from: 'ai',
                          text: "I'm here with you. Tell me what's happening and we'll figure this out together.",
                          lvl: 1
                        }])
                      }}
                    >
                      No, I'm okay
                    </button>
                  </div>
                </div>
              )}
              <div className="chat-input-row">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  placeholder={listening ? 'Listening...' : 'Type how you feel...'}
                  className="chat-input"
                  style={{ '--chat-border': listening ? '#ef4444' : `${color}55` }}
                />
                {speechSupported && (
                  <div className="mic-btn-wrapper">
                    <button
                      className={`mic-btn${listening ? ' mic-listening' : ''}`}
                      onClick={() => listening ? stopListening() : startListening()}
                      title="Tap to speak — we'll listen"
                      aria-label={listening ? 'Stop listening' : 'Start voice input'}
                    >
                      🎤
                    </button>
                  </div>
                )}
                <button onClick={sendChat} aria-label="Send chat message" className="chat-send-btn ui-btn" style={{ '--chat-send': color }}>Send</button>
              </div>
              {listening && (
                <div className="listening-label">
                  <span className="listening-dot" />
                  Listening… tap mic to stop
                </div>
              )}
              {/* Crisis card inside chat — shown when AI detects escalation during conversation */}
              {showCrisisCard && (
                <CrisisCard onDismiss={() => setShowCrisisCard(false)} />
              )}
              <div className="chat-safety-footer">
                Campus Police: 404-413-5717&nbsp;&nbsp;|&nbsp;&nbsp;Crisis Text Line: Text HOME to 741741
              </div>
            </div>
          )}
          </>
          )}
        </>
      )}
    </div>
  )
}
