import { useState, useEffect, useRef } from 'react'
import './App.css'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { getAIInsights, getJournalSummary } from './api'

import {
  MOODS, GSU_CENTER, SEED_PINS, WAVE_PINS, SECRET_STRESS_PINS,
} from './constants'
import { getTimeOfDay, getArea } from './utils'
import {
  initJournalPins, saveJournalPins, initStreak, bumpStreak,
  loadRecoveryStories, saveRecoveryStories,
} from './storage'

import PinDropper from './components/PinDropper'
import MoodCount from './components/MoodCount'
import CompanionPanel from './components/CompanionPanel'
import CounselorAlert from './components/CounselorAlert'
import UpdateMoodPanel from './components/UpdateMoodPanel'
import RecoveryFeed from './components/RecoveryFeed'
import CrisisPanel from './components/CrisisPanel'
import MoodJournal from './components/MoodJournal'
import RelativeTime from './components/RelativeTime'

export default function App() {
  const [pins, setPins] = useState(SEED_PINS)
  const [pending, setPending] = useState(null)
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errorToast, setErrorToast] = useState(null)
  const [wavePinIds, setWavePinIds] = useState(new Set())
  const [newPinIds, setNewPinIds] = useState(new Set())
  const [waving, setWaving] = useState(false)
  const [companion, setCompanion] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [activityFeed, setActivityFeed] = useState([])
  const [recentCount, setRecentCount] = useState(0)
  const [crisisMode, setCrisisMode] = useState(false)
  const [crisisPinIds, setCrisisPinIds] = useState(new Set())
  const [resolutionMode, setResolutionMode] = useState(false)
  const [resolvedPinIds, setResolvedPinIds] = useState(new Set())
  const [userPins, setUserPins] = useState(() => initJournalPins())
  const [streak, setStreak] = useState(() => initStreak())
  const [journalSummary, setJournalSummary] = useState(() => localStorage.getItem('moodmap_journal_summary') || '')
  const [loadingJournal, setLoadingJournal] = useState(false)
  const [updateTarget, setUpdateTarget] = useState(null)
  const [recoveryStories, setRecoveryStories] = useState(() => loadRecoveryStories())
  const [showResetBtn, setShowResetBtn] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetFlash, setResetFlash] = useState(false)
  const [sosPinIds, setSosPinIds] = useState(new Set())
  const [emergencyAlert, setEmergencyAlert] = useState(null)
  const [happyPlaces, setHappyPlaces] = useState([])
  const [happyPlaceIds, setHappyPlaceIds] = useState(new Set())
  const [joinToast, setJoinToast] = useState(null)
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('moodmap_theme')
    if (stored === 'light' || stored === 'dark') return stored
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  )
  const mapRef = useRef(null)
  const recentTimerRef = useRef(null)
  const clickedPinRef = useRef(false)
  const secretStressRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('moodmap_theme', theme)
  }, [theme])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!media) return undefined
    const onChange = event => setPrefersReducedMotion(event.matches)
    if (media.addEventListener) {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [])

  useEffect(() => {
    function countRecent() {
      const cutoff = Date.now() - 5 * 60 * 1000
      setRecentCount(pins.filter(p => p.timestamp && p.timestamp >= cutoff).length)
    }
    countRecent()
    clearInterval(recentTimerRef.current)
    recentTimerRef.current = setInterval(countRecent, 30000)
    return () => clearInterval(recentTimerRef.current)
  }, [pins])

  useEffect(() => {
    saveJournalPins(userPins)
  }, [userPins])

  useEffect(() => {
    const iv = setInterval(() => {
      const cutoff = Date.now() - 30 * 60 * 1000
      setHappyPlaces(prev => {
        const expired = prev.filter(p => p.lastJoinAt < cutoff)
        if (expired.length > 0) {
          setHappyPlaceIds(ids => {
            const n = new Set(ids)
            expired.forEach(p => n.delete(p.id))
            return n
          })
          return prev.filter(p => p.lastJoinAt >= cutoff)
        }
        return prev
      })
    }, 60_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (!e.ctrlKey || !e.shiftKey) return
      if (e.key === 'R') {
        e.preventDefault()
        setShowResetBtn(prev => !prev)
        setShowResetConfirm(false)
      }
      if (e.key === 'S') {
        e.preventDefault()
        secretStressRef.current?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function handleReset() {
    setPins(SEED_PINS)
    setInsights(null)
    setLastUpdated(null)
    setWavePinIds(new Set())
    setNewPinIds(new Set())
    setCrisisMode(false)
    setCrisisPinIds(new Set())
    setResolutionMode(false)
    setResolvedPinIds(new Set())
    setActivityFeed([])
    setRecentCount(0)
    setUpdateTarget(null)
    setCompanion(null)
    setPending(null)
    setRecoveryStories([])
    saveRecoveryStories([])
    setShowResetConfirm(false)
    setShowResetBtn(false)
    setSosPinIds(new Set())
    setEmergencyAlert(null)
    setHappyPlaces([])
    setHappyPlaceIds(new Set())
    setJoinToast(null)
    setResetFlash(true)
    setTimeout(() => setResetFlash(false), 2400)
  }

  function handleMakeHappyPlace(pinId) {
    const pin = pins.find(p => p.id === pinId)
    if (!pin) return
    const place = {
      id: pinId,
      lat: pin.lat, lng: pin.lng,
      area: getArea(pin.lat),
      mood: pin.mood, color: pin.color, emoji: pin.emoji,
      count: 1,
      createdAt: Date.now(),
      lastJoinAt: Date.now()
    }
    setHappyPlaces(prev => [place, ...prev])
    setHappyPlaceIds(prev => new Set([...prev, pinId]))
  }

  function handleJoinHappyPlace(placeId) {
    setHappyPlaces(prev => prev.map(p =>
      p.id === placeId ? { ...p, count: p.count + 1, lastJoinAt: Date.now() } : p
    ))
    setJoinToast("You're heading somewhere good. The people there don't know you're coming — just show up, sit nearby, absorb the good energy. You don't have to say anything. 🌟")
    setTimeout(() => setJoinToast(null), 7000)
  }

  function handleShowHappyPlace(place) {
    mapRef.current?.flyTo([place.lat, place.lng], 17, { duration: prefersReducedMotion ? 0 : 1.5 })
  }

  async function handleSecretStressWave() {
    if (waving || loading) return
    for (let i = 0; i < SECRET_STRESS_PINS.length; i++) {
      await new Promise(r => setTimeout(r, 250))
      const id = Date.now() + i
      const pin = {
        id,
        lat: SECRET_STRESS_PINS[i].lat,
        lng: SECRET_STRESS_PINS[i].lng,
        mood: 'Stressed', color: '#F44336', emoji: '😤',
        time: new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
        timestamp: Date.now()
      }
      const area = getArea(SECRET_STRESS_PINS[i].lat)
      setPins(prev => [...prev, pin])
      setNewPinIds(prev => new Set([...prev, id]))
      setActivityFeed(prev => [{ id, emoji:'😤', mood:'Stressed', area }, ...prev].slice(0, 5))
      setTimeout(() => setNewPinIds(prev => { const n = new Set(prev); n.delete(id); return n }), 1900)
    }
  }

  secretStressRef.current = handleSecretStressWave

  async function generateJournal(journalPins) {
    setLoadingJournal(true)
    try {
      const { summary } = await getJournalSummary(journalPins)
      setJournalSummary(summary)
      localStorage.setItem('moodmap_journal_summary', summary)
    } catch(e) {
      setErrorToast(e.message || 'Could not generate journal')
      setTimeout(() => setErrorToast(null), 5000)
    }
    setLoadingJournal(false)
  }

  function handlePinUpdate(pinId, newMood, story) {
    const origPin = pins.find(p => p.id === pinId)
    if (!origPin) return

    setPins(prev => prev.map(p => p.id === pinId ? {
      ...p,
      mood: newMood.label, color: newMood.color, emoji: newMood.emoji,
      hasStory: !!story,
      story: story || null,
      fromMood: p.mood, fromEmoji: p.emoji
    } : p))

    setNewPinIds(prev => new Set([...prev, pinId]))
    setTimeout(() => setNewPinIds(prev => { const n = new Set(prev); n.delete(pinId); return n }), 1900)

    setUserPins(prev => prev.map(p => p.id === pinId
      ? { ...p, mood: newMood.label, color: newMood.color, emoji: newMood.emoji }
      : p))

    if (story) {
      const newStory = {
        id: Date.now(),
        fromMood: origPin.mood, fromEmoji: origPin.emoji,
        toMood: newMood.label,  toEmoji: newMood.emoji,
        area: getArea(origPin.lat),
        story, timestamp: Date.now(), hearts: 0
      }
      setRecoveryStories(prev => {
        const updated = [newStory, ...prev].slice(0, 20)
        saveRecoveryStories(updated)
        return updated
      })
    }
    setUpdateTarget(null)
  }

  function handleHeartStory(storyId) {
    setRecoveryStories(prev => {
      const updated = prev.map(s => s.id === storyId ? { ...s, hearts: s.hearts + 1 } : s)
      saveRecoveryStories(updated)
      return updated
    })
  }

  function activateCrisisMode() {
    const ids = new Set(
      pins.filter(p => p.mood === 'Stressed' || p.mood === 'Anxious').map(p => p.id)
    )
    setCrisisPinIds(ids)
    setCrisisMode(true)
  }

  function deactivateCrisisMode() {
    setCrisisMode(false)
    setCrisisPinIds(new Set())
    setResolutionMode(false)
    setResolvedPinIds(new Set())
  }

  async function activateResolutionMode() {
    if (resolutionMode) return
    setResolutionMode(true)
    const shuffled = [...pins.map(p => p.id)].sort(() => Math.random() - 0.5)
    for (const id of shuffled) {
      await new Promise(r => setTimeout(r, 55))
      setResolvedPinIds(prev => new Set([...prev, id]))
    }
  }

  async function handleAnalyse(currentPins) {
    setLoading(true)
    try {
      const result = await getAIInsights(currentPins ?? pins)
      setInsights(result)
      setLastUpdated(Date.now())
    } catch(e) {
      const errMsg = e.message || 'Could not reach AI'
      setInsights({
        hotspot: 'Could not reach AI — check your API key in .env',
        dominant: '?',
        alert: errMsg,
        vibe: '?'
      })
      setErrorToast(errMsg)
      setTimeout(() => setErrorToast(null), 5000)
    }
    setLoading(false)
  }

  async function simulateStressWave() {
    if (waving || loading) return
    setWaving(true)
    setInsights(null)

    const newIds = []
    const addedPins = []

    for (let i = 0; i < WAVE_PINS.length; i++) {
      await new Promise(r => setTimeout(r, 300))
      const id = Date.now() + i
      const pin = {
        id,
        lat: WAVE_PINS[i].lat,
        lng: WAVE_PINS[i].lng,
        mood: 'Stressed',
        color: '#F44336',
        emoji: '😤',
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now()
      }
      newIds.push(id)
      addedPins.push(pin)
      const area = getArea(WAVE_PINS[i].lat)
      setPins(prev => [...prev, pin])
      setWavePinIds(prev => new Set([...prev, id]))
      setNewPinIds(prev => new Set([...prev, id]))
      setActivityFeed(prev => [{ id, emoji: '😤', mood: 'Stressed', area }, ...prev].slice(0, 5))
      setTimeout(() => setNewPinIds(prev => { const n = new Set(prev); n.delete(id); return n }), 1900)
    }

    setWaving(false)
    setTimeout(() => setWavePinIds(new Set()), 2000)
    await handleAnalyse([...SEED_PINS, ...addedPins])
  }

  function handleMapClick(latlng) { setPending(latlng) }

  function addMoodPin(mood, location) {
    const id = Date.now()
    const area = getArea(location.lat)
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    setPins(prev => [...prev, {
      id, lat: location.lat, lng: location.lng,
      mood: mood.label, color: mood.color, emoji: mood.emoji,
      time, timestamp: Date.now()
    }])
    setNewPinIds(prev => new Set([...prev, id]))
    setTimeout(() => setNewPinIds(prev => { const n = new Set(prev); n.delete(id); return n }), 1900)
    setActivityFeed(prev => [{ id, emoji: mood.emoji, mood: mood.label, area }, ...prev].slice(0, 5))

    const journalEntry = { id, time, mood: mood.label, emoji: mood.emoji, color: mood.color, area }
    const newUserPins = [...userPins, journalEntry]
    if (userPins.length === 0) setStreak(bumpStreak())
    setUserPins(newUserPins)
    if (newUserPins.length >= 2) generateJournal(newUserPins)

    setCompanion({
      pinId: id, mood: mood.label, color: mood.color,
      extras: {
        timeOfDay: getTimeOfDay(),
        pinNumber: newUserPins.length,
        randomSeed: Math.floor(Math.random() * 1000) + 1
      }
    })
  }

  function handleMoodSelect(mood) {
    if (!pending) return
    addMoodPin(mood, pending)
    setPending(null)
  }

  function handleQuickCheckIn(mood) {
    const jitterLat = (Math.random() - 0.5) * 0.0008
    const jitterLng = (Math.random() - 0.5) * 0.0008
    addMoodPin(mood, { lat: GSU_CENTER[0] + jitterLat, lng: GSU_CENTER[1] + jitterLng })
  }

  function openUserPinEditor(pinId) {
    const pin = pins.find(p => p.id === pinId)
    if (!pin) return
    clickedPinRef.current = true
    setPending(null)
    setUpdateTarget(pin)
  }

  function handleFeelBetter() {
    if (!companion) return
    setPins(prev => prev.map(p => {
      if (p.id !== companion.pinId) return p
      const safeColor = p.color.length === 7 ? p.color + '99' : p.color
      return { ...p, color: safeColor }
    }))
    setCompanion(null)
  }

  const vibeColors = {
    Happy:'#4CAF50', Excited:'#FF9800',
    Anxious:'#9C27B0', Stressed:'#F44336', Sad:'#2196F3'
  }

  const userPinIds = new Set(userPins.map(p => p.id))
  const recentUserPins = [...userPins].slice(-5).reverse()

  const moodTotals = {}
  MOODS.forEach(m => { moodTotals[m.label] = 0 })
  pins.forEach(p => { if (moodTotals[p.mood] !== undefined) moodTotals[p.mood]++ })
  const dominantMood = pins.length
    ? Object.entries(moodTotals).sort((a, b) => b[1] - a[1])[0][0]
    : null
  const mapOverlayColor =
    crisisMode && !resolutionMode ? 'rgba(183,28,28,0.09)' :
    resolutionMode                ? 'rgba(76,175,80,0.07)' :
    dominantMood === 'Stressed'   ? 'rgba(244,67,54,0.05)' :
    dominantMood === 'Happy'      ? 'rgba(76,175,80,0.05)' : 'transparent'
  const liveCounterClassName = crisisMode && !resolutionMode
    ? 'live-counter live-counter-danger'
    : resolutionMode
      ? 'live-counter live-counter-success'
      : 'live-counter'
  const mapTileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
  const mapTileAttribution = theme === 'dark'
    ? '&copy; OpenStreetMap contributors &copy; CARTO'
    : '&copy; OpenStreetMap contributors'

  return (
    <div className={`app-root${companion ? ' companion-open' : ''}`}>
      <header className="app-header">
        <div>
          <div className="app-header-title">MoodMap</div>
          <div className="app-header-sub">Campus emotional pulse</div>
        </div>
        <div className="app-header-badge" aria-live="polite">
          {pins.length} active
        </div>
        <button
          className="theme-toggle-btn ui-btn ui-btn-pill"
          onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-pressed={theme === 'dark'}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          <span className="theme-toggle-icon" aria-hidden="true">
            {theme === 'light' ? '☾' : '☀'}
          </span>
          <span className="theme-toggle-fallback">{theme === 'light' ? 'Dark' : 'Light'}</span>
          <span className="sr-only">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
        </button>
      </header>

      <div className="app-layout">
        <div className="app-map-area" role="region" aria-label="Campus mood map">
          <div className="sr-only" aria-live="polite">
            {pins.length} mood pins on campus. Dominant mood: {dominantMood || 'none'}.
          </div>
          <MapContainer
            ref={mapRef}
            center={GSU_CENTER}
            zoom={16}
            style={{ width:'100%', height:'100%' }}
          >
            <TileLayer
              url={mapTileUrl}
              attribution={mapTileAttribution}
            />
            <PinDropper onDrop={handleMapClick} skipRef={clickedPinRef} />
            {pins.map(pin => {
              const isResolved   = resolvedPinIds.has(pin.id)
              const isSOS        = sosPinIds.has(pin.id)
              const isHappyPlace = !isSOS && happyPlaceIds.has(pin.id)
              const isCrisis     = !isResolved && !isSOS && !isHappyPlace && crisisPinIds.has(pin.id)
              const isWave       = !isResolved && !isSOS && !isHappyPlace && !isCrisis && wavePinIds.has(pin.id)
              const isNew        = !isResolved && !isSOS && !isHappyPlace && !isCrisis && !isWave && newPinIds.has(pin.id)
              const isUserPin    = userPinIds.has(pin.id)
              const hasStory     = !!pin.hasStory
              const hpData       = isHappyPlace ? happyPlaces.find(p => p.id === pin.id) : null
              return (
                <CircleMarker
                  key={pin.id}
                  center={[pin.lat, pin.lng]}
                  radius={isSOS ? 18 : isHappyPlace ? 17 : isWave ? 16 : isCrisis ? 14 : hasStory ? 15 : 13}
                  fillColor={
                    isSOS        ? '#FF0000' :
                    isHappyPlace ? '#FFC107' :
                    isResolved   ? '#81C784' : pin.color
                  }
                  color={
                    isSOS                  ? '#FF0000' :
                    isHappyPlace           ? '#FF8F00' :
                    isResolved             ? '#4CAF50' :
                    (isCrisis || isWave)   ? '#FF0000' :
                    hasStory               ? '#FFD700' : 'white'
                  }
                  weight={isSOS ? 4 : isHappyPlace ? 4 : (isCrisis || isWave) ? 3 : hasStory ? 4 : 2}
                  fillOpacity={isResolved ? 0.65 : 0.9}
                  className={
                    isSOS        ? 'sos-pin'        :
                    isHappyPlace ? 'happy-place-pin' :
                    isResolved   ? 'resolved-pin'   :
                    isCrisis     ? 'crisis-pin'     :
                    isWave       ? 'wave-pin'        :
                    hasStory     ? 'story-pin'      :
                    isNew        ? 'pin-new'        : ''
                  }
                  eventHandlers={isUserPin ? {
                    click: () => openUserPinEditor(pin.id)
                  } : {}}
                >
                  {isHappyPlace ? (
                    <Popup>
                      <div className="happy-place-popup">
                        <div className="happy-place-popup-title">
                          ✨ Happy Place — open to visitors
                        </div>
                        <div className="happy-place-popup-copy">
                          {hpData?.count ?? 1} {(hpData?.count ?? 1) === 1 ? 'person' : 'people'} here, welcoming company
                        </div>
                        <button
                          onClick={() => { clickedPinRef.current = true; handleJoinHappyPlace(pin.id) }}
                          className="happy-place-popup-btn ui-btn"
                        >
                          Join this vibe 🌟
                        </button>
                      </div>
                    </Popup>
                  ) : !isUserPin && (
                    <Popup>
                      {hasStory ? (
                        <div style={{ maxWidth: 200 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            {pin.fromEmoji} {pin.fromMood} → {pin.emoji} {pin.mood}
                          </div>
                          <div style={{ fontSize: 12, fontStyle: 'italic', color: '#555', lineHeight: 1.5 }}>
                            "{pin.story}"
                          </div>
                        </div>
                      ) : (
                        `${pin.emoji} ${pin.mood} — ${pin.time}`
                      )}
                    </Popup>
                  )}
                </CircleMarker>
              )
            })}
          </MapContainer>
          <div className="map-tint-overlay" style={{ background: mapOverlayColor }} />
          <div className={liveCounterClassName}>
            {crisisMode && !resolutionMode
              ? 'Crisis mode active — monitoring all zones'
              : resolutionMode
              ? 'Resolution in progress…'
              : recentCount === 0
              ? 'No new drops in the last 5 min'
              : `${recentCount} ${recentCount === 1 ? 'person' : 'people'} checked in recently`}
          </div>

          {companion && (
            <div className="companion-panel-wrapper">
              <CompanionPanel
                mood={companion.mood}
                color={companion.color}
                extras={companion.extras || {}}
                prefersReducedMotion={prefersReducedMotion}
                onClose={() => setCompanion(null)}
                onFeelBetter={handleFeelBetter}
                onEmergency={() => {
                  if (companion.pinId) setSosPinIds(prev => new Set([...prev, companion.pinId]))
                  const pin = pins.find(p => p.id === companion.pinId)
                  const area = pin ? getArea(pin.lat) : 'campus'
                  setEmergencyAlert({ area })
                }}
                onSafeConfirmed={() => {
                  if (companion.pinId) setSosPinIds(prev => { const n = new Set(prev); n.delete(companion.pinId); return n })
                  setEmergencyAlert(null)
                }}
                onMakeHappyPlace={() => handleMakeHappyPlace(companion.pinId)}
                happyPlaces={happyPlaces}
                onShowHappyPlace={handleShowHappyPlace}
              />
            </div>
          )}
          {updateTarget && (
            <div className="update-panel-wrapper">
              <UpdateMoodPanel
                pin={updateTarget}
                onClose={() => setUpdateTarget(null)}
                onUpdate={handlePinUpdate}
              />
            </div>
          )}
          {pending && (
            <div className="mood-picker">
              <div className="mood-picker-title">
                How are you feeling here?
              </div>
              <div className="mood-picker-grid" role="group" aria-label="Choose your current mood">
                {MOODS.map(mood => (
                  <button
                    key={mood.label}
                    className="mood-picker-btn ui-btn"
                    onClick={() => handleMoodSelect(mood)}
                    aria-label={`Select ${mood.label} mood`}
                    style={{
                      '--mood-color': mood.color,
                      '--mood-bg': `${mood.color}22`
                    }}
                  >
                    <span className="mood-picker-emoji" role="img" aria-hidden="true">{mood.emoji}</span>
                    <span className="mood-picker-label">{mood.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPending(null)}
                aria-label="Cancel mood selection"
                className="ghost-link-btn ui-btn"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <aside className="app-sidebar">
          {emergencyAlert && (
            <div className="emergency-counselor-banner">
              <div className="emergency-counselor-title">
                POSSIBLE EMERGENCY
              </div>
              <div className="emergency-counselor-body">
                Student near <strong>{emergencyAlert.area}</strong> may need immediate assistance. Emergency keywords detected in companion chat.
              </div>
              <a
                href="tel:+14044135717"
                className="emergency-call-btn ui-btn"
              >
                Alert Campus Police
              </a>
              <button
                onClick={() => setEmergencyAlert(null)}
                aria-label="Dismiss emergency alert"
                className="emergency-dismiss-btn ui-btn"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="panel-card ui-card">
            <div className="panel-title">
              Live mood breakdown
            </div>
            <MoodCount pins={pins} />
          </div>
          <div className="panel-card ui-card">
            <div className="panel-title panel-title-inline">
              <span className="panel-live-dot" />
              Live activity
            </div>
            {activityFeed.length === 0 ? (
              <div className="panel-empty">
                Drop a mood on the map…
              </div>
            ) : (
              <div className="activity-feed-list">
                {activityFeed.map(entry => (
                  <div key={entry.id} className="activity-entry activity-entry-row">
                    {entry.emoji} Someone near <strong>{entry.area}</strong> is feeling {entry.mood}
                  </div>
                ))}
              </div>
            )}
          </div>
          {happyPlaces.length > 0 && (
            <div className="happy-places-card">
              <div className="happy-places-title">
                Happy Places Now
              </div>
              <div className="happy-places-list">
                {happyPlaces.map(place => (
                  <div key={place.id} className="happy-place-row">
                    <div>
                      <div className="happy-place-row-title">
                        {place.emoji} near {place.area}
                      </div>
                      <div className="happy-place-row-meta">
                        {place.count} {place.count === 1 ? 'person' : 'people'} — welcoming company
                      </div>
                    </div>
                    <button
                      onClick={() => handleShowHappyPlace(place)}
                      className="happy-place-find-btn ui-btn"
                    >
                      Find it
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {crisisMode ? (
            <CrisisPanel
              onDeactivate={deactivateCrisisMode}
              onResolution={activateResolutionMode}
              resolutionActive={resolutionMode}
            />
          ) : (
            <button
              className="crisis-toggle-btn ui-btn"
              onClick={activateCrisisMode}
              aria-label="Activate campus crisis mode"
            >
              Activate Crisis Mode
            </button>
          )}

          <button
            onClick={() => handleAnalyse()}
            disabled={loading || waving}
            aria-label="Get AI insights on campus mood"
            className="primary-cta-btn ui-btn"
          >
            {loading ? 'Analysing…' : 'Get AI Insights'}
          </button>

          <button
            onClick={simulateStressWave}
            disabled={loading || waving}
            aria-label="Simulate a stress wave on the map"
            className="danger-cta-btn ui-btn"
          >
            {waving ? 'Spreading…' : loading ? 'Analysing…' : 'Simulate Stress Wave'}
          </button>

          {lastUpdated && (
            <div className="last-updated-text">
              Last updated: <RelativeTime timestamp={lastUpdated} />
            </div>
          )}

          {insights && (
            <div className="insights-stack">
              <div className="panel-card ui-card">
                <div className="insights-kicker">CAMPUS VIBE RIGHT NOW</div>
                <div className="insights-vibe" style={{ color: vibeColors[insights.vibe] || 'var(--text-1)' }}>
                  {insights.vibe}
                </div>
              </div>

              <div className="panel-card ui-card">
                <div className="insights-kicker">HOTSPOT DETECTED</div>
                <div className="insights-hotspot">
                  {insights.hotspot}
                </div>
              </div>

              <CounselorAlert vibe={insights.vibe} hotspot={insights.hotspot} />
            </div>
          )}

          <div className="quick-checkin-card ui-card" role="group" aria-label="Quick mood check-in">
            <div className="quick-checkin-title">Quick check-in</div>
            <div className="quick-checkin-grid">
              {MOODS.map(mood => (
                <button
                  key={mood.label}
                  className="quick-checkin-btn ui-btn"
                  onClick={() => handleQuickCheckIn(mood)}
                  aria-label={`Quick check in as ${mood.label}`}
                  style={{ '--quick-color': mood.color }}
                >
                  <span aria-hidden="true">{mood.emoji}</span>
                  <span>{mood.label}</span>
                </button>
              ))}
            </div>
          </div>

          <RecoveryFeed stories={recoveryStories} onHeart={handleHeartStory} />

          <MoodJournal
            userPins={userPins}
            streak={streak}
            journalSummary={journalSummary}
            loadingJournal={loadingJournal}
          />

          <div className="howto-card">
            <strong>How to use:</strong><br/>
            Click anywhere on the map to drop your mood anonymously. Hit "Get AI Insights" to see what the campus is feeling.
          </div>

        </aside>
      </div>
      {showResetBtn && !showResetConfirm && (
        <button
          className="reset-btn ui-btn ui-btn-pill"
          onClick={() => setShowResetConfirm(true)}
          aria-label="Reset demo"
        >
          Reset Demo
        </button>
      )}

      {showResetConfirm && (
        <div className="reset-confirm">
          <div className="reset-confirm-body">
            Reset map to 40 seed pins? This clears all live pins added during demo.
          </div>
          <div className="reset-confirm-actions">
            <button
              onClick={handleReset}
              aria-label="Confirm reset"
              className="reset-confirm-yes ui-btn"
            >
              Yes, Reset
            </button>
            <button
              onClick={() => { setShowResetConfirm(false); setShowResetBtn(false) }}
              aria-label="Cancel reset"
              className="reset-confirm-no ui-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {resetFlash && <div className="demo-flash">Demo reset</div>}
      {errorToast && (
        <div className="error-toast" role="alert">
          {errorToast}
          <button
            onClick={() => setErrorToast(null)}
            aria-label="Dismiss error"
            className="error-toast-dismiss"
          >✕</button>
        </div>
      )}
      {joinToast && (
        <div className="join-toast">
          <div className="join-toast-text">{joinToast}</div>
        </div>
      )}
    </div>
  )
}
