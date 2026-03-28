import 'dotenv/config'
import express from 'express'
import {
  requireEnv, setCors, setSecurityHeaders, rateLimitMiddleware,
  validateMood, validateMessage, validatePins, validateEntries,
  isPositiveMood, callGroq, parseLLMJson, getBuilding, safeError, getDeviceId
} from './lib/groq.js'
import {
  canDeviceDropPin, createPin, updatePin as storeUpdatePin,
  deletePin as storeDeletePin, addSupport
} from './lib/pinStore.js'
import { callPyChat, postPyJson, getPyHealth } from './lib/pyClient.js'
import { detectSafetyLevel, getDeterministicSafetyReply } from './lib/chatSafety.js'

requireEnv()

const app = express()

app.use((req, res, next) => {
  setSecurityHeaders(res)
  next()
})

app.use((req, res, next) => {
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  next()
})

app.use(express.json({ limit: '50kb' }))

app.use('/api', rateLimitMiddleware)

const ENABLE_PY_PROXY_EXTRA_ROUTES = process.env.PY_PROXY_EXTRA_ROUTES !== '0'

app.get('/health', async (_, res) => {
  try {
    const python = await getPyHealth({ timeoutMs: 2_500 })
    res.json({ ok: true, python })
  } catch (error) {
    res.status(200).json({
      ok: true,
      python: { ok: false, error: error.message },
    })
  }
})

app.post('/api/insights', async (req, res) => {
  if (ENABLE_PY_PROXY_EXTRA_ROUTES) {
    try {
      const pins = validatePins(req.body?.pins)
      if (!pins) return res.status(400).json({ error: 'Invalid or empty pins array' })

      const pyResult = await postPyJson('/py/insights', { pins })
      if (
        typeof pyResult?.hotspot === 'string' &&
        typeof pyResult?.dominant === 'string' &&
        typeof pyResult?.alert === 'string' &&
        typeof pyResult?.vibe === 'string'
      ) {
        return res.json(pyResult)
      }
    } catch (error) {
      console.warn('Python insights unavailable, falling back to Node LLM:', error.message)
    }
  }

  try {
    const pins = validatePins(req.body?.pins)
    if (!pins) return res.status(400).json({ error: 'Invalid or empty pins array' })

    const summary = pins.map(p => `${p.mood} at ${getBuilding(p.lat)}`).join('\n')

    const text = await callGroq({
      systemPrompt: `You are analyzing anonymous mood data dropped on a campus map.
Return a JSON object with exactly this shape:
{
  "hotspot": "one sentence describing the most emotionally intense area",
  "dominant": "the single most common mood word",
  "alert": "one actionable recommendation for campus counselors",
  "vibe": "one word overall campus vibe right now"
}
Only return the JSON. No extra text.`,
      userPrompt: `Here are the mood pins:\n${summary}`,
      maxTokens: 400
    })

    res.json(parseLLMJson(text))
  } catch (e) {
    safeError(res, e, 'Insights')
  }
})

function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th` }

app.post('/api/comfort', async (req, res) => {
  if (ENABLE_PY_PROXY_EXTRA_ROUTES) {
    try {
      const mood = validateMood(req.body?.mood)
      if (!mood) return res.status(400).json({ error: 'Invalid mood value' })

      const timeOfDay = ['morning', 'afternoon', 'evening', 'night'].includes(req.body?.timeOfDay)
        ? req.body.timeOfDay
        : 'morning'
      const pinNumber = Math.max(1, Math.min(100, Number(req.body?.pinNumber) || 1))
      const randomSeed = Math.max(0, Math.min(10000, Number(req.body?.randomSeed) || 500))

      const pyResult = await postPyJson('/py/comfort', {
        mood,
        timeOfDay,
        pinNumber,
        randomSeed,
      })

      if (typeof pyResult?.message === 'string' && typeof pyResult?.action === 'string') {
        return res.json({
          message: pyResult.message,
          action: pyResult.action,
          joke: pyResult.joke || null,
          reminder: pyResult.reminder || null,
          musicVibes: pyResult.musicVibes || null,
          recoveryPrompt: pyResult.recoveryPrompt || null,
        })
      }
    } catch (error) {
      console.warn('Python comfort unavailable, falling back to Node LLM:', error.message)
    }
  }

  try {
    const mood = validateMood(req.body?.mood)
    if (!mood) return res.status(400).json({ error: 'Invalid mood value' })

    const timeOfDay = ['morning', 'afternoon', 'evening', 'night'].includes(req.body?.timeOfDay)
      ? req.body.timeOfDay : 'morning'
    const pinNumber = Math.max(1, Math.min(100, Number(req.body?.pinNumber) || 1))
    const randomSeed = Math.max(0, Math.min(10000, Number(req.body?.randomSeed) || 500))

    const isPositive = isPositiveMood(mood)

    const moodExtra = {
      Sad: `EXTRA for SAD: include ONE of these (choose by seed ${randomSeed} % 4):
0: Name a famous person who overcame deep sadness and found meaning
1: Suggest one tiny act of kindness they can do for someone else RIGHT NOW
2: Remind them this feeling is shared by millions of students worldwide
3: Suggest texting one specific type of person (an old friend, a sibling, their favourite professor)`,
      Anxious: `EXTRA for ANXIOUS: include ONE grounding technique (choose by seed ${randomSeed} % 3):
0: The 5-4-3-2-1 senses exercise
1: Reality check — "Will this matter in 5 years? 5 weeks? 5 days?"
2: Body scan — "Unclench your jaw. Drop your shoulders. Unball your fists."`,
      Happy: `EXTRA for HAPPY: include ONE of these (choose by seed ${randomSeed} % 3):
0: A unique, slightly surprising way to celebrate or lock in this feeling
1: Challenge them to do one kind thing with their good energy in the next hour
2: A genuinely interesting science fact about how their happiness is chemically improving the mood of people near them`,
      Excited: `EXTRA for EXCITED: channel this electric energy into something unforgettable today`
    }

    const checkInNote = pinNumber > 1
      ? `This is their ${ordinal(pinNumber)} mood check-in today — honour their self-awareness.`
      : `This is their first check-in today.`

    const timeNote = {
      morning: "It's morning — reference the fresh start, the day still being full of possibility.",
      afternoon: "It's afternoon — reference the momentum of the day, the home stretch ahead.",
      evening: "It's evening — reference winding down, reflecting on the day, self-care before rest.",
      night: "It's late at night — reference rest, that tomorrow is a clean slate, the importance of sleep."
    }[timeOfDay] || ''

    const rotatingElement = `Include exactly ONE of these elements (choose by seed ${randomSeed} % 6):
0: A specific music suggestion with genre + exact vibe + WHY it helps right now
1: A micro-challenge to do in the next 2 minutes
2: A funny but genuinely kind observation about student life
3: A 60-second grounding or breathing exercise WITH full instructions
4: A reminder about a universal student struggle they are not alone in
5: A genuine, specific compliment about the courage to check in on mental health`

    const jsonShape = isPositive
      ? `{
  "message": "unique warm 2-3 sentence opening celebrating their positive energy",
  "action": "one specific joyful thing to do RIGHT NOW",
  "joke": "a playful, kind observation or fun challenge",
  "reminder": "a unique positive reminder that feels personal",
  "musicVibes": "specific artist/genre/playlist with one sentence on why it fits",
  "recoveryPrompt": "a fun reflection question to savour this good feeling"
}`
      : `{
  "message": "unique warm 2-3 sentences — zero clichés, genuine empathy",
  "action": "one specific tiny thing to do RIGHT NOW — concrete and immediate",
  "joke": "a light observation that doesn't dismiss their feeling",
  "reminder": "a unique reminder of their strength — specific, not generic",
  "musicVibes": "specific artist/genre/song vibe with a sentence on why it helps",
  "recoveryPrompt": "a gentle reflection question to understand what they need"
}`

    const systemPrompt = `Generate a COMPLETELY UNIQUE warm message for a college student. No two should ever sound alike.
NEVER use: "I understand", "That must be", "I hear you", "It's okay to", or any therapy-speak clichés.
${isPositive ? '' : 'Each message must feel like it came from a genuinely different personality.'}
${moodExtra[mood] || ''}
${rotatingElement}
Return ONLY this JSON (no extra text):
${jsonShape}`

    const userPrompt = `Student is feeling ${mood} at ${timeOfDay}. ${checkInNote} ${timeNote} Variety seed: ${randomSeed}.`

    const text = await callGroq({ systemPrompt, userPrompt, maxTokens: 500 })
    res.json(parseLLMJson(text))
  } catch (e) {
    safeError(res, e, 'Comfort')
  }
})

app.post('/api/chat', async (req, res) => {
  let mood
  let message

  try {
    mood = validateMood(req.body?.mood)
    message = validateMessage(req.body?.message)
    if (!mood || !message) return res.status(400).json({ error: 'Invalid mood or message' })

    const safetyLevel = detectSafetyLevel(message)
    if (safetyLevel >= 2) {
      return res.json({
        reply: getDeterministicSafetyReply(safetyLevel),
        safetyLevel,
        source: 'safety',
      })
    }

    const rawConversationId = req.body?.conversationId
    const conversationId =
      typeof rawConversationId === 'string' && rawConversationId.trim()
        ? rawConversationId.trim().slice(0, 120)
        : undefined

    const pyResult = await callPyChat({ mood, message, conversationId })
    const reply =
      typeof pyResult?.reply === 'string'
        ? pyResult.reply
        : typeof pyResult?.message === 'string'
          ? pyResult.message
          : null

    if (reply) {
      return res.json({
        reply,
        conversationId: pyResult.conversationId || conversationId || null,
        safetyLevel,
        source: 'python',
      })
    }
  } catch (error) {
    console.warn('Python chat unavailable, falling back to Node LLM:', error.message)
  }

  try {
    mood = mood || validateMood(req.body?.mood)
    message = message || validateMessage(req.body?.message)
    if (!mood || !message) return res.status(400).json({ error: 'Invalid mood or message' })

    const reply = await callGroq({
      systemPrompt: `You are a warm, supportive best friend chatting with a student who is feeling ${mood}.
Reply with empathy, maybe a little humour, always kind.
Keep it to 2-4 sentences. No bullet points. No clinical language. Just real, warm conversation.
Do not introduce yourself. Just respond naturally.`,
      userPrompt: message,
      maxTokens: 200
    })

    res.json({ reply, source: 'node-fallback' })
  } catch (e) {
    safeError(res, e, 'Chat')
  }
})

app.post('/api/journal', async (req, res) => {
  if (ENABLE_PY_PROXY_EXTRA_ROUTES) {
    try {
      const entries = validateEntries(req.body?.entries)
      if (!entries) return res.status(400).json({ error: 'Invalid or empty entries array' })

      const pyResult = await postPyJson('/py/journal', { entries })
      if (typeof pyResult?.summary === 'string' && pyResult.summary.trim()) {
        return res.json({ summary: pyResult.summary })
      }
    } catch (error) {
      console.warn('Python journal unavailable, falling back to Node LLM:', error.message)
    }
  }

  try {
    const entries = validateEntries(req.body?.entries)
    if (!entries) return res.status(400).json({ error: 'Invalid or empty entries array' })

    const timeline = entries.map(e => `${e.time} — ${e.mood} near ${e.area}`).join('\n')

    const reply = await callGroq({
      systemPrompt: `Write a warm, personal 2-3 sentence reflection on a student's emotional journey today.
Sound like a caring friend who noticed their patterns — not a therapist or chatbot.
Celebrate resilience, acknowledge hard moments, and end with genuine encouragement.
Return only the reflection text. No quotes, no labels, no extra formatting.`,
      userPrompt: `A student tracked their moods throughout today on a campus app:\n${timeline}`,
      maxTokens: 150
    })

    res.json({ summary: reply })
  } catch (e) {
    safeError(res, e, 'Journal')
  }
})

app.post('/api/generate-reel-script', async (req, res) => {
  if (ENABLE_PY_PROXY_EXTRA_ROUTES) {
    try {
      const pins = validatePins(req.body?.pins)
      if (!pins) return res.status(400).json({ error: 'Invalid or empty pins array' })
      const recoveryStories = Array.isArray(req.body?.recoveryStories)
        ? req.body.recoveryStories.slice(0, 5)
        : []

      const pyResult = await postPyJson('/py/generate-reel-script', {
        pins,
        recoveryStories,
      })

      if (pyResult?.data && typeof pyResult.data === 'object') {
        return res.json(pyResult)
      }
    } catch (error) {
      console.warn('Python reel script unavailable, falling back to Node LLM:', error.message)
    }
  }

  try {
    const pins = validatePins(req.body?.pins)
    if (!pins) return res.status(400).json({ error: 'Invalid or empty pins array' })

    const recoveryStories = Array.isArray(req.body?.recoveryStories)
      ? req.body.recoveryStories.slice(0, 5)
      : []

    const locationStats = {}
    const moodTotals = {}

    for (const pin of pins) {
      const area = getBuilding(pin.lat)
      if (!locationStats[area]) locationStats[area] = {}
      locationStats[area][pin.mood] = (locationStats[area][pin.mood] || 0) + 1
      moodTotals[pin.mood] = (moodTotals[pin.mood] || 0) + 1
    }

    const topLocations = Object.entries(locationStats)
      .map(([area, moods]) => ({
        area,
        total: Object.values(moods).reduce((a, b) => a + b, 0),
        dominant: Object.entries(moods).sort((a, b) => b[1] - a[1])[0][0],
        moods,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 4)

    const overallDominant = Object.entries(moodTotals)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Stressed'

    const moodBreakdown = Object.entries(moodTotals)
      .map(([mood, count]) => ({ mood, count, pct: Math.round((count / pins.length) * 100) }))
      .sort((a, b) => b.count - a.count)

    const now = new Date()
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    let aiHeadline = `${dayName.toUpperCase()} VIBE CHECK`
    let aiTagline = 'the campus never lies.'
    try {
      const prompt = `You're a TikTok narrator. In exactly 2 lines, describe this campus vibe:
${pins.length} students dropped moods. Dominant: ${overallDominant}. Top spot: ${topLocations[0]?.area} (${topLocations[0]?.total} pins).
Line 1: A bold 3-5 word ALL CAPS headline (no emoji, no quotes)
Line 2: A 5-8 word lowercase tagline that sounds dramatic or poetic (no emoji, no quotes)
Return ONLY the 2 lines. Nothing else.`
      const text = await callGroq({ systemPrompt: 'You output only raw text, no markdown, no quotes, no emoji.', userPrompt: prompt, maxTokens: 80 })
      const lines = text.replace(/\*\*/g, '').replace(/"/g, '').trim().split('\n').filter(l => l.trim())
      if (lines[0]) aiHeadline = lines[0].trim().toUpperCase()
      if (lines[1]) aiTagline = lines[1].trim().toLowerCase()
    } catch { /* use defaults */ }

    const storyHighlights = recoveryStories.slice(0, 3).map(s => ({
      from: s.fromMood || 'Stressed',
      to: s.toMood || 'Happy',
      area: s.area || 'Campus',
      story: typeof s.story === 'string' ? s.story.slice(0, 80) : '',
    }))

    res.json({
      data: {
        totalPins: pins.length,
        dominantMood: overallDominant,
        day: dayName,
        time: timeStr,
        aiHeadline,
        aiTagline,
        topLocations,
        moodBreakdown,
        storyHighlights,
      }
    })
  } catch (e) {
    safeError(res, e, 'ReelScript')
  }
})

app.post('/api/pin', (req, res) => {
  const deviceId = getDeviceId(req)
  if (!deviceId) return res.status(400).json({ error: 'Missing or invalid device ID' })

  const { action, pin, pinId, updates } = req.body

  if (action === 'create') {
    if (!canDeviceDropPin(deviceId)) {
      return res.status(429).json({ error: 'Please wait before dropping another pin' })
    }
    if (!pin || typeof pin !== 'object') return res.status(400).json({ error: 'Invalid pin data' })
    const stored = createPin(deviceId, pin)
    return res.json({ pin: stored })
  }

  if (action === 'update') {
    if (!pinId) return res.status(400).json({ error: 'Missing pinId' })
    const result = storeUpdatePin(deviceId, pinId, updates || {})
    if (result.error) return res.status(result.status).json({ error: result.error })
    return res.json(result)
  }

  if (action === 'delete') {
    if (!pinId) return res.status(400).json({ error: 'Missing pinId' })
    const result = storeDeletePin(deviceId, pinId)
    if (result.error) return res.status(result.status).json({ error: result.error })
    return res.json(result)
  }

  res.status(400).json({ error: 'Invalid action' })
})

app.post('/api/support', (req, res) => {
  const deviceId = getDeviceId(req)
  if (!deviceId) return res.status(400).json({ error: 'Missing or invalid device ID' })

  const { pinId, type } = req.body
  if (!pinId) return res.status(400).json({ error: 'Missing pinId' })
  if (type && !['hug', 'metoo'].includes(type)) return res.status(400).json({ error: 'Invalid type' })

  const result = addSupport(deviceId, pinId, type || 'hug')
  if (result.error) return res.status(result.status).json({ error: result.error })
  res.json(result)
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
