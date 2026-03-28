import { useState, useEffect, useRef, useMemo } from 'react'
import { POSITIVE_MOODS } from '../constants'
import { detectLevel } from '../utils'
import { getAIComfort, getAIChat } from '../api'

export default function CompanionPanel({ mood, color, onClose, onFeelBetter, extras = {},
  onEmergency, onSafeConfirmed, onMakeHappyPlace, happyPlaces = [], onShowHappyPlace }) {
  const [comfort, setComfort] = useState(null)
  const [typing, setTyping] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState([])
  const [chatTyping, setChatTyping] = useState(false)
  // 0=none, 1=L1 emotional, 2=L2 soft threat, 3=L3 full emergency
  const [emergencyLevel, setEmergencyLevel] = useState(0)
  const emergencyLevelRef = useRef(0) // #6: sync ref to avoid stale closures
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

  // #16: memoize extras to stabilize dependency
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableExtras = useMemo(() => extras, [extras.timeOfDay, extras.pinNumber, extras.randomSeed])

  useEffect(() => {
    setComfortError(false)
    getAIComfort(mood, stableExtras).then(data => {
      setComfort(data)
      setTyping(false)
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
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory, chatTyping])

  // Cleanup on unmount
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

    // ── Track message timestamps for escalation (3+ in 60s)
    const now = Date.now()
    msgTimestampsRef.current = [...msgTimestampsRef.current, now]
      .filter(t => now - t < 60000)
    const recentCount = msgTimestampsRef.current.length

    // ── Detect level of this specific message
    const msgLevel = detectLevel(msg)

    // ── Apply escalation: 3+ rapid msgs while already L1/L2 bumps level
    // #6 FIX: Read from ref (always current) instead of relying on setState callback
    const prev = emergencyLevelRef.current
    let effectiveLevel
    if (recentCount >= 3 && prev >= 1) {
      effectiveLevel = Math.min(3, Math.max(msgLevel, prev + 1))
    } else {
      effectiveLevel = Math.max(msgLevel, prev)
    }
    setEmergencyLevel(effectiveLevel)
    emergencyLevelRef.current = effectiveLevel

    // ── L3: Full emergency
    if (effectiveLevel >= 3) {
      onEmergency?.()
      setChatHistory(h => [...h, {
        from: 'ai',
        text: "This sounds serious. Your safety comes first. Please call 911 or Campus Police immediately. If you cannot call, text 911 in Georgia. Stay in a lit public area. I am here with you.",
        lvl: 3
      }])
      return
    }

    // ── L2: Soft safety check
    if (effectiveLevel === 2) {
      setChatHistory(h => [...h, {
        from: 'ai',
        text: "I want to make sure you're okay. Are you in a safe place right now? If you feel physically threatened at any point, please don't hesitate to call Campus Police or 911.",
        lvl: 2
      }])
      return
    }

    // ── L1 or 0: AI responds normally
    setChatTyping(true)
    try {
      const { reply } = await getAIChat(mood, msg)
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

  const bg = isPositive ? '#f0fdf4' : '#fff8f8'
  const border = `2px solid ${color}33`

  return (
    <div className="companion-panel" style={{ borderTop: `4px solid ${color}` }}>

      {/* ── L3: Full-screen emergency overlay */}
      {emergencyLevel >= 3 && (
        <div className="emergency-overlay">
          <div className="emergency-box">
            <div className="emergency-title">🚨 ARE YOU IN IMMEDIATE DANGER?</div>
            <div className="emergency-btns">
              <a href="tel:911" className="emergency-btn emergency-btn-911">
                📞 CALL 911
              </a>
              <a href="tel:+14044135717" className="emergency-btn emergency-btn-police">
                📞 CALL GSU CAMPUS POLICE
              </a>
              <button className="emergency-btn emergency-btn-safe" onClick={handleSafe}>
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

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:22 }}>{isPositive ? '🌟' : '🤗'}</span>
          <span style={{ fontWeight:700, fontSize:14, color:'#222' }}>
            {isPositive ? 'Your vibe is amazing!' : 'Hey, I got you.'}
          </span>
        </div>
        <button onClick={onClose} aria-label="Close companion panel" style={{
          background:'none', border:'none', fontSize:18,
          cursor:'pointer', color:'#767676', lineHeight:1, minHeight:44, minWidth:44
        }}>✕</button>
      </div>

      {typing ? (
        <div style={{ display:'flex', gap:5, padding:'10px 0', alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#636363' }}>typing</span>
          <div className="typing-dots">
            <span style={{ background: color }} /><span style={{ background: color }} /><span style={{ background: color }} />
          </div>
        </div>
      ) : comfort && (
        <>
          {/* Error notice */}
          {comfortError && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'8px 12px', marginBottom:10, fontSize:11, color:'#991b1b', lineHeight:1.5 }}>
              ⚠️ Couldn't reach the AI — showing a fallback message
            </div>
          )}
          {/* Message */}
          <div style={{ background: bg, border, borderRadius:12, padding:12, marginBottom:10, fontSize:13, lineHeight:1.7, color:'#333' }}>
            {comfort.message}
          </div>

          {/* Joke / fun fact */}
          <div style={{ background:'#fffbea', border:'1px solid #fde68a', borderRadius:10, padding:10, marginBottom:10, fontSize:12, color:'#78350f', lineHeight:1.6 }}>
            💡 {comfort.joke}
          </div>

          {/* Action */}
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:16, marginTop:1 }}>🎯</span>
            <div style={{ fontSize:13, color:'#444', lineHeight:1.6 }}>
              <strong>Right now:</strong> {comfort.action}
            </div>
          </div>

          {/* Reminder */}
          <div style={{
            borderLeft: `3px solid ${color}`, paddingLeft:10,
            fontSize:12, color:'#555', fontStyle:'italic', lineHeight:1.6, marginBottom:10
          }}>
            {comfort.reminder}
          </div>

          {/* Music vibes */}
          {comfort.musicVibes && (
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:16, flexShrink:0, marginTop:1 }}>🎵</span>
              <div style={{ fontSize:12, color:'#444', lineHeight:1.6 }}>
                <strong>Right now:</strong> {comfort.musicVibes}
              </div>
            </div>
          )}

          {/* Recovery / reflection prompt */}
          {comfort.recoveryPrompt && (
            <div style={{
              background:'#f8f4ff', borderRadius:10, padding:'9px 12px',
              fontSize:12, color:'#7c3aed', lineHeight:1.6, marginBottom:14,
              fontStyle:'italic'
            }}>
              💭 {comfort.recoveryPrompt}
            </div>
          )}

          {/* Buttons */}
          {isPositive ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button onClick={onClose} style={{
                width:'100%', padding:'10px 0', borderRadius:10, border:'none',
                background: color, color:'white', fontWeight:700, fontSize:13, cursor:'pointer'
              }}>
                Keep spreading good vibes ✨
              </button>

              {/* Happy Place prompt */}
              {!happyPlaceDecided && (
                <div className="happy-place-prompt">
                  <div style={{ fontSize:13, fontWeight:700, color:'#854d0e', marginBottom:3 }}>
                    ✨ Make this a Happy Place?
                  </div>
                  <div style={{ fontSize:11, color:'#92400e', marginBottom:10, lineHeight:1.5 }}>
                    Invite others who are struggling to come find your good energy here.
                  </div>
                  <div style={{ display:'flex', gap:7 }}>
                    <button
                      onClick={() => { setHappyPlaceDecided(true); setMadeHappyPlace(true); onMakeHappyPlace?.() }}
                      style={{
                        flex:2, padding:'9px 0', borderRadius:9, border:'none',
                        background:'#d97706', color:'white',
                        fontWeight:700, fontSize:12, cursor:'pointer'
                      }}
                    >
                      Yes, open this spot 🌟
                    </button>
                    <button
                      onClick={() => setHappyPlaceDecided(true)}
                      style={{
                        flex:1, padding:'9px 0', borderRadius:9,
                        border:'1px solid #e0c97f', background:'transparent',
                        fontSize:11, color:'#92400e', cursor:'pointer'
                      }}
                    >
                      Keep private
                    </button>
                  </div>
                </div>
              )}
              {madeHappyPlace && (
                <div style={{
                  background:'#fef3c7', borderRadius:10, padding:'10px 12px',
                  fontSize:12, color:'#78350f', lineHeight:1.6,
                  border:'1px solid #fde68a', textAlign:'center'
                }}>
                  🌟 Happy Place created! Others can now see your spot and join your energy.
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {/* Nearby Happy Places — shown to struggling users */}
              {activeHappyPlaces.length > 0 && (
                <div className="nearby-happy-places">
                  <div style={{ fontSize:12, fontWeight:700, color:'#1e3a5f', marginBottom:4 }}>
                    You don't have to be alone right now.
                  </div>
                  <div style={{ fontSize:11, color:'#374151', lineHeight:1.6, marginBottom:8 }}>
                    There are Happy Places nearby where people are gathered and welcoming company.
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {activeHappyPlaces.slice(0, 3).map(place => (
                      <div key={place.id} style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        gap:8, background:'#fffbeb', borderRadius:8,
                        padding:'7px 10px', border:'1px solid #fde68a'
                      }}>
                        <span style={{ fontSize:12, color:'#78350f' }}>
                          😊 <strong>near {place.area}</strong> — {place.count} {place.count === 1 ? 'person' : 'people'}
                        </span>
                        <button
                          onClick={() => onShowHappyPlace?.(place)}
                          style={{
                            background:'#d97706', color:'white',
                            border:'none', borderRadius:8,
                            padding:'4px 10px', fontSize:10,
                            fontWeight:700, cursor:'pointer', flexShrink:0
                          }}
                        >
                          Show me
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!showChat && (
                <button onClick={() => setShowChat(true)} style={{
                  width:'100%', padding:'10px 0', borderRadius:10, border:`2px solid ${color}`,
                  background:'white', color: color, fontWeight:700, fontSize:13, cursor:'pointer'
                }}>
                  💬 Talk to me
                </button>
              )}
              <button onClick={onFeelBetter} style={{
                width:'100%', padding:'10px 0', borderRadius:10, border:'none',
                background: color, color:'white', fontWeight:700, fontSize:13, cursor:'pointer'
              }}>
                I feel a bit better 💛
              </button>
            </div>
          )}

          {/* Chat */}
          {showChat && (
            <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:8 }}>

              {/* Header row — privacy note + read-aloud toggle */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:11, color:'#636363' }}>
                  Anonymous — nothing is saved 🔒
                </div>
                <button
                  onClick={() => { if (readAloud) window.speechSynthesis?.cancel(); setReadAloud(r => !r) }}
                  title={readAloud ? 'Turn off read aloud' : 'Read AI replies aloud'}
                  style={{
                    background: readAloud ? `${color}18` : 'transparent',
                    border: `1.5px solid ${readAloud ? color : '#ddd'}`,
                    borderRadius:20, padding:'3px 10px',
                    fontSize:12, cursor:'pointer',
                    color: readAloud ? color : '#aaa',
                    display:'flex', alignItems:'center', gap:4,
                    transition:'all 0.2s'
                  }}
                >
                  {readAloud ? '🔊' : '🔇'} <span style={{ fontSize:10 }}>{readAloud ? 'On' : 'Off'}</span>
                </button>
              </div>

              {/* ── L2: Yellow safety banner */}
              {emergencyLevel === 2 && (
                <div className="emergency-l2-banner">
                  📞 If you need help: <strong>Campus Police 404-413-5717</strong>
                </div>
              )}

              {/* Message bubbles */}
              <div style={{
                maxHeight:180, overflowY:'auto', display:'flex',
                flexDirection:'column', gap:6, padding:'4px 0'
              }}>
                {chatHistory.length === 0 && (
                  <div style={{ fontSize:12, color:'#767676', textAlign:'center', padding:'8px 0' }}>
                    Tell me what's on your mind...
                  </div>
                )}
                {chatHistory.map((m, i) => (
                  <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      alignSelf: m.from === 'user' ? 'flex-end' : 'flex-start',
                      background: m.from === 'user' ? color : '#f0f0f0',
                      color: m.from === 'user' ? 'white' : '#333',
                      borderRadius: m.from === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      padding:'8px 12px', fontSize:12, lineHeight:1.6,
                      maxWidth:'85%'
                    }}>
                      {m.text}
                    </div>
                    {/* L1: subtle help link under every AI message */}
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
                  <div style={{ alignSelf:'flex-start', background:'#f0f0f0', borderRadius:'14px 14px 14px 4px', padding:'8px 12px', display:'flex', gap:4, alignItems:'center' }}>
                    <div className="typing-dots"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* ── L2: "I need help now" button / confirm question */}
              {emergencyLevel === 2 && !helpNowQuestion && (
                <button
                  className="help-now-btn"
                  onClick={() => setHelpNowQuestion(true)}
                >
                  I need help now
                </button>
              )}
              {emergencyLevel === 2 && helpNowQuestion && (
                <div className="help-now-question">
                  <div style={{ fontSize:12, fontWeight:600, color:'#7c2d12', marginBottom:8, lineHeight:1.5 }}>
                    Are you in immediate physical danger right now?
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      className="help-now-yes"
                      onClick={() => { setEmergencyLevel(3); setHelpNowQuestion(false); onEmergency?.() }}
                    >
                      YES, I need help
                    </button>
                    <button
                      className="help-now-no"
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

              {/* Input row */}
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChat()}
                  placeholder={listening ? 'Listening...' : 'Type how you feel...'}
                  style={{
                    flex:1, padding:'8px 12px', borderRadius:20,
                    border:`1.5px solid ${listening ? '#ef4444' : color + '55'}`,
                    fontSize:12, fontFamily:'inherit',
                    transition:'border-color 0.2s'
                  }}
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
                <button onClick={sendChat} aria-label="Send chat message" style={{
                  background: color, color:'white', border:'none',
                  borderRadius:20, padding:'8px 14px', fontSize:12,
                  cursor:'pointer', fontWeight:600, flexShrink:0,
                  minHeight:44
                }}>Send</button>
              </div>

              {/* Listening status label */}
              {listening && (
                <div className="listening-label">
                  <span className="listening-dot" />
                  Listening… tap mic to stop
                </div>
              )}

              {/* ── Permanent safety footer */}
              <div className="chat-safety-footer">
                Campus Police: 404-413-5717&nbsp;&nbsp;|&nbsp;&nbsp;Crisis Text Line: Text HOME to 741741
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
