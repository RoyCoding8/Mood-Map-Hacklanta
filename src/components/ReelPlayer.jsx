import { useState, useEffect, useRef, useCallback } from 'react'
import './ReelPlayer.css'

const MOOD_COLORS = {
  Happy: '#22c55e', Excited: '#f59e0b', Anxious: '#a855f7',
  Stressed: '#ef4444', Sad: '#3b82f6',
}

const BG_IMAGES = [
  '/reel-assets/campus-aerial.png',
  '/reel-assets/students-stress.png',
  '/reel-assets/campus-happy.png',
]

const VIDEO_DURATION = 30000 // 30 seconds in ms

// ── Animated counter ─────────────────────────────────────────────────────────
function AnimCount({ target, duration = 1500, delay = 0 }) {
  const [val, setVal] = useState(0)
  const [started, setStarted] = useState(false)
  const rafRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  useEffect(() => {
    if (!started) return
    startRef.current = null
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts
      const p = Math.min((ts - startRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 4)
      setVal(Math.round(eased * target))
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [started, target, duration])

  return <span>{val}</span>
}

// ── Main ReelPlayer ──────────────────────────────────────────────────────────
export default function ReelPlayer({ data, onClose }) {
  const [isPlaying, setIsPlaying] = useState(true)
  const [activeBg, setActiveBg] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [key, setKey] = useState(0)  // for replaying all animations
  const containerRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])

  const {
    totalPins = 0, dominantMood = 'Stressed', day = 'Today', time = 'Now',
    aiHeadline = 'CAMPUS VIBE CHECK', aiTagline = 'the campus never lies.',
    topLocations = [], moodBreakdown = [], storyHighlights = [],
  } = data || {}

  const maxLocCount = Math.max(...topLocations.map(l => l.total), 1)

  // ── Cycle background images with Ken Burns ──────────────────────────────
  useEffect(() => {
    if (!isPlaying) return
    const timers = [
      setTimeout(() => setActiveBg(1), 5000),   // switch at 5s
      setTimeout(() => setActiveBg(2), 14000),   // switch at 14s
      setTimeout(() => setActiveBg(0), 22000),   // switch at 22s
      setTimeout(() => setIsPlaying(false), VIDEO_DURATION),
    ]
    return () => timers.forEach(clearTimeout)
  }, [isPlaying, key])

  // ── Replay ──────────────────────────────────────────────────────────────
  function replay() {
    setKey(k => k + 1)
    setIsPlaying(true)
    setActiveBg(0)
    setDownloadUrl(null)
  }

  // ── Canvas recording ───────────────────────────────────────────────────
  async function record() {
    replay()
    setIsRecording(true)
    setDownloadUrl(null)

    await new Promise(r => setTimeout(r, 300))

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 720
      canvas.height = 1280
      const ctx = canvas.getContext('2d')

      // Preload images
      const imgs = {}
      await Promise.all(BG_IMAGES.map(src => new Promise(resolve => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => { imgs[src] = img; resolve() }
        img.onerror = resolve
        img.src = src
      })))

      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 6_000_000,
      })
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        setDownloadUrl(URL.createObjectURL(blob))
        setIsRecording(false)
      }

      recorder.start()
      const startTime = Date.now()
      const w = canvas.width, h = canvas.height

      const renderFrame = () => {
        if (!recorderRef.current || recorderRef.current.state !== 'recording') return
        const elapsed = Date.now() - startTime
        const t = elapsed / 1000 // seconds

        // Background
        const bgIdx = t < 5 ? 0 : t < 14 ? 1 : t < 22 ? 2 : 0
        const bgImg = imgs[BG_IMAGES[bgIdx]]
        if (bgImg) {
          // Ken Burns: slow zoom
          const zoom = 1 + (t % 12) * 0.01
          const ox = Math.sin(t * 0.1) * 15
          const oy = Math.cos(t * 0.1) * 10
          const imgR = bgImg.width / bgImg.height
          const canR = w / h
          let sw, sh, sx, sy
          if (imgR > canR) { sh = bgImg.height; sw = sh * canR; sx = (bgImg.width - sw) / 2; sy = 0 }
          else { sw = bgImg.width; sh = sw / canR; sx = 0; sy = (bgImg.height - sh) / 2 }
          ctx.save()
          ctx.translate(w / 2 + ox, h / 2 + oy)
          ctx.scale(zoom, zoom)
          ctx.translate(-w / 2, -h / 2)
          ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, w, h)
          ctx.restore()
        } else {
          ctx.fillStyle = '#050510'
          ctx.fillRect(0, 0, w, h)
        }

        // Dark overlay
        const grad = ctx.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, 'rgba(5,5,16,0.5)')
        grad.addColorStop(0.3, 'rgba(5,5,16,0.2)')
        grad.addColorStop(0.7, 'rgba(5,5,16,0.6)')
        grad.addColorStop(1, 'rgba(5,5,16,0.9)')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)

        ctx.textAlign = 'left'
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 15
        const lx = 48

        // Progress bar
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.beginPath(); ctx.roundRect(32, 28, w - 64, 5, 3); ctx.fill()
        ctx.fillStyle = 'white'
        const prog = Math.min(t / 30, 1) * (w - 64)
        ctx.beginPath(); ctx.roundRect(32, 28, prog, 5, 3); ctx.fill()

        // Segment 1: Intro (0-5s)
        if (t < 5.5) {
          const a = Math.min(t / 0.5, 1) * (t < 4.5 ? 1 : Math.max(0, 1 - (t - 4.5) / 0.5))
          ctx.globalAlpha = a
          ctx.textAlign = 'center'

          ctx.font = '700 22px "Space Grotesk", sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.35)'
          ctx.letterSpacing = '4px'
          ctx.fillText('MOODMAP', w / 2, h / 2 - 80)

          ctx.font = '700 64px "Space Grotesk", sans-serif'
          ctx.fillStyle = 'white'
          ctx.shadowBlur = 20
          // Word wrap headline
          const words = aiHeadline.split(' ')
          let lines = [], cur = ''
          for (const word of words) {
            const test = cur ? `${cur} ${word}` : word
            if (ctx.measureText(test).width > w - 96) { lines.push(cur); cur = word }
            else cur = test
          }
          if (cur) lines.push(cur)
          lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 - 10 + i * 70))

          ctx.shadowBlur = 0
          ctx.font = 'italic 400 28px "DM Sans", sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.5)'
          ctx.fillText(aiTagline, w / 2, h / 2 + lines.length * 70 + 20)

          ctx.font = '600 20px "DM Sans", sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.3)'
          ctx.fillText(`${day} · ${time}`, w / 2, h / 2 + lines.length * 70 + 65)

          ctx.globalAlpha = 1
          ctx.textAlign = 'left'
        }

        // Segment 2: Locations (5-14s)
        if (t >= 5 && t < 14.5) {
          const segT = t - 5
          const a = Math.min(segT / 0.5, 1) * (segT < 8.5 ? 1 : Math.max(0, 1 - (segT - 8.5) / 0.5))
          ctx.globalAlpha = a
          ctx.shadowBlur = 10

          ctx.font = '700 18px "DM Sans", sans-serif'
          ctx.fillStyle = 'rgba(255,255,255,0.3)'
          ctx.fillText('WHERE THE VIBES ARE', lx, h - 400)

          topLocations.slice(0, 4).forEach((loc, i) => {
            const itemDelay = 0.8 + i * 0.5
            if (segT < itemDelay) return
            const itemAlpha = Math.min((segT - itemDelay) / 0.4, 1)
            ctx.globalAlpha = a * itemAlpha
            const y = h - 350 + i * 65

            ctx.font = '700 26px "Space Grotesk", sans-serif'
            ctx.fillStyle = 'white'
            ctx.fillText(loc.area, lx, y)

            ctx.font = '500 18px "DM Sans", sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.35)'
            ctx.fillText(`${loc.total} pins · ${loc.dominant}`, lx, y + 22)

            // Animated bar
            const barW = (loc.total / maxLocCount) * (w - 96) * Math.min((segT - itemDelay) / 1, 1)
            const barColor = MOOD_COLORS[loc.dominant] || '#6366f1'
            ctx.fillStyle = barColor + '50'
            ctx.beginPath(); ctx.roundRect(lx, y + 30, barW, 6, 3); ctx.fill()
          })

          // Highlight text
          if (segT > 4) {
            ctx.globalAlpha = a * Math.min((segT - 4) / 0.5, 1)
            ctx.font = '700 28px "Space Grotesk", sans-serif'
            ctx.fillStyle = 'white'
            const hl = `${topLocations[0]?.area || 'Library'} leads with ${topLocations[0]?.total || 0} pins`
            ctx.fillText(hl, lx, h - 100)
          }

          ctx.globalAlpha = 1
        }

        // Segment 3: Mood breakdown (14-22s)
        if (t >= 14 && t < 22.5) {
          const segT = t - 14
          const a = Math.min(segT / 0.5, 1) * (segT < 7.5 ? 1 : Math.max(0, 1 - (segT - 7.5) / 0.5))
          ctx.globalAlpha = a
          ctx.textAlign = 'center'

          ctx.font = '700 30px "Space Grotesk", sans-serif'
          ctx.fillStyle = 'white'
          ctx.fillText('CAMPUS MOOD CHECK', w / 2, 200)

          ctx.textAlign = 'left'
          moodBreakdown.slice(0, 5).forEach((m, i) => {
            const itemDelay = 1 + i * 0.3
            if (segT < itemDelay) return
            ctx.globalAlpha = a * Math.min((segT - itemDelay) / 0.4, 1)
            const y = 280 + i * 60

            ctx.font = '600 22px "DM Sans", sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.6)'
            ctx.fillText(m.mood, lx, y)

            // Mood bar
            const barMax = w - 200
            const barW = (m.pct / 100) * barMax * Math.min((segT - itemDelay) / 1, 1)
            ctx.fillStyle = (MOOD_COLORS[m.mood] || '#6366f1') + '60'
            ctx.beginPath(); ctx.roundRect(180, y - 14, barW, 16, 4); ctx.fill()

            ctx.font = '700 22px "Space Grotesk", sans-serif'
            ctx.fillStyle = 'white'
            ctx.fillText(`${m.pct}%`, 180 + barW + 10, y)
          })

          // Big number
          if (segT > 5) {
            ctx.globalAlpha = a * Math.min((segT - 5) / 0.6, 1)
            ctx.textAlign = 'center'
            ctx.font = '700 100px "Space Grotesk", sans-serif'
            ctx.fillStyle = 'white'
            ctx.shadowBlur = 25
            const countVal = Math.round(totalPins * Math.min((segT - 5) / 1.5, 1))
            ctx.fillText(String(countVal), w / 2, h - 200)
            ctx.shadowBlur = 0
            ctx.font = '700 18px "DM Sans", sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.3)'
            ctx.fillText('MOOD PINS DROPPED TODAY', w / 2, h - 155)
          }

          ctx.globalAlpha = 1
          ctx.textAlign = 'left'
        }

        // Segment 4: CTA (22-30s)
        if (t >= 22) {
          const segT = t - 22
          ctx.globalAlpha = Math.min(segT / 0.6, 1)
          ctx.textAlign = 'center'

          if (segT > 0.5) {
            ctx.font = '700 46px "Space Grotesk", sans-serif'
            ctx.fillStyle = 'white'
            ctx.shadowBlur = 20
            ctx.fillText('DROP YOUR', w / 2, h / 2 - 40)
            ctx.fillText('MOOD', w / 2, h / 2 + 20)
          }

          if (segT > 1.5) {
            ctx.shadowBlur = 0
            ctx.font = '500 24px "DM Sans", sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.fillText('stay anonymous. stay real.', w / 2, h / 2 + 70)
          }

          if (segT > 3) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)'
            ctx.fillRect(w / 2 - 30, h / 2 + 110, 60, 2)

            ctx.font = '700 30px "Space Grotesk", sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.5)'
            ctx.fillText('MOODMAP', w / 2, h / 2 + 165)

            ctx.font = '600 16px "DM Sans", sans-serif'
            ctx.fillStyle = 'rgba(255,255,255,0.25)'
            ctx.fillText('moodmap.app', w / 2, h / 2 + 195)
          }

          ctx.globalAlpha = 1
          ctx.textAlign = 'left'
        }

        ctx.shadowBlur = 0

        if (t < 30.5) {
          requestAnimationFrame(renderFrame)
        } else {
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
        }
      }

      requestAnimationFrame(renderFrame)
    } catch (err) {
      console.error('Recording error:', err)
      setIsRecording(false)
    }
  }

  function download() {
    if (!downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `moodmap-vibe-${new Date().toISOString().slice(0, 10)}.webm`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!data) return null

  return (
    <div className="reel-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ position: 'relative' }}>
        <button className="reel-close" onClick={onClose} aria-label="Close">✕</button>

        <div ref={containerRef} className="reel-phone-frame" key={key}>
          {/* Background layers with Ken Burns */}
          {BG_IMAGES.map((src, i) => (
            <div
              key={i}
              className={`reel-bg-layer kb-${i + 1} ${activeBg === i ? 'active' : ''}`}
              style={{ backgroundImage: `url(${src})` }}
            />
          ))}
          <div className="reel-dark-overlay" />

          {/* Progress bar */}
          <div className="reel-progress-bar">
            <div className={`reel-progress-fill ${isPlaying ? 'running' : ''}`} />
          </div>

          {/* All segments render simultaneously — CSS handles timing */}
          <div className="reel-video-content">
            {/* SEG 1: Intro (0–5s) */}
            <div className="reel-segment reel-seg-intro">
              <div className="reel-brand">MoodMap</div>
              <div className="reel-title">{aiHeadline}</div>
              <div className="reel-tagline">{aiTagline}</div>
              <div className="reel-day-pill">{day} · {time}</div>
            </div>

            {/* SEG 2: Location hotspots (5–14s) */}
            <div className="reel-segment reel-seg-locations">
              <div className="reel-loc-label">Where the vibes are</div>
              {topLocations.slice(0, 4).map((loc, i) => (
                <div key={i} className="reel-loc-item">
                  <div style={{ flex: 1 }}>
                    <div className="reel-loc-name">{loc.area}</div>
                    <div className="reel-loc-dominant">{loc.dominant} dominant</div>
                  </div>
                  <div className="reel-loc-bar-wrap">
                    <div
                      className="reel-loc-bar"
                      style={{
                        '--bar-pct': loc.total / maxLocCount,
                        background: MOOD_COLORS[loc.dominant] || '#6366f1',
                      }}
                    />
                  </div>
                  <div className="reel-loc-count">{loc.total}</div>
                </div>
              ))}
              <div className="reel-loc-highlight">
                {topLocations[0]?.area || 'Library'} leads with {topLocations[0]?.total || 0} pins
              </div>
            </div>

            {/* SEG 3: Mood breakdown (14–22s) */}
            <div className="reel-segment reel-seg-moods">
              <div className="reel-mood-title">Campus Mood Check</div>
              <div className="reel-mood-grid">
                {moodBreakdown.slice(0, 5).map((m, i) => (
                  <div key={i} className="reel-mood-row">
                    <div className="reel-mood-label">{m.mood}</div>
                    <div className="reel-mood-bar-wrap">
                      <div
                        className="reel-mood-bar-fill"
                        style={{
                          '--bar-pct': m.pct / 100,
                          background: MOOD_COLORS[m.mood] || '#6366f1',
                        }}
                      />
                    </div>
                    <div className="reel-mood-pct">{m.pct}%</div>
                  </div>
                ))}
              </div>
              <div className="reel-mood-insight">
                {dominantMood} is the dominant mood across campus
              </div>
              <div className="reel-big-number">
                <AnimCount target={totalPins} delay={19000} duration={1500} />
              </div>
              <div className="reel-big-label">mood pins dropped today</div>
            </div>

            {/* SEG 4: CTA Outro (22–30s) */}
            <div className="reel-segment reel-seg-outro">
              <div className="reel-cta-line1">Drop Your<br />Mood</div>
              <div className="reel-cta-line2">stay anonymous. stay real.</div>
              <div className="reel-cta-divider" />
              <div className="reel-cta-brand">MoodMap</div>
              <div className="reel-cta-sub">moodmap.app</div>
            </div>
          </div>

          <div className="reel-watermark">MoodMap</div>
        </div>

        {/* Controls */}
        <div className="reel-controls">
          <button className="reel-ctrl" onClick={replay}>Replay</button>
          <button
            className="reel-ctrl accent"
            onClick={record}
            disabled={isRecording}
          >
            {isRecording ? 'Recording…' : 'Record'}
          </button>
          {downloadUrl && (
            <button className="reel-ctrl download" onClick={download}>Download</button>
          )}
        </div>
      </div>
    </div>
  )
}
