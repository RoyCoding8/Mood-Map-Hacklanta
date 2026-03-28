import 'dotenv/config'
import express from 'express'
import {
  requireEnv, setCors, setSecurityHeaders, rateLimitMiddleware,
  validateMood, validateMessage, validatePins, validateEntries,
  isPositiveMood, callGroq, parseLLMJson, getBuilding, safeError,
  validateDeviceId, checkPinRateLimit,
} from './lib/groq.js'

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

app.post('/api/insights', async (req, res) => {
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
  try {
    const mood = validateMood(req.body?.mood)
    const message = validateMessage(req.body?.message)
    if (!mood || !message) return res.status(400).json({ error: 'Invalid mood or message' })

    const reply = await callGroq({
      systemPrompt: `You are a warm, supportive best friend chatting with a student who is feeling ${mood}.
Reply with empathy, maybe a little humour, always kind.
Keep it to 2-4 sentences. No bullet points. No clinical language. Just real, warm conversation.
Do not introduce yourself. Just respond naturally.`,
      userPrompt: message,
      maxTokens: 200
    })

    res.json({ reply })
  } catch (e) {
    safeError(res, e, 'Chat')
  }
})

app.post('/api/journal', async (req, res) => {
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

// ── Pin ownership routes ──────────────────────────────────────────────────────
//
// In-memory map:  firebaseDocId → deviceId
//
// Why in-memory?  The server is the rate-limit + ownership gatekeeper; the
// actual Firestore write/update/delete still happens on the client after the
// server returns 200.  Restarting the server clears the map, but for a
// hackathon (and even for production with a single dyno) this is fine.
//
// For multi-instance production: replace the Map with a Redis SET/GET.
//
const pinOwnership = new Map()    // { [firebaseDocId]: deviceId }
const MAX_OWNERSHIP_ENTRIES = 10_000

function readDeviceId(req) {
  return validateDeviceId(req.headers['x-device-id'])
}

function pruneOwnership() {
  if (pinOwnership.size > MAX_OWNERSHIP_ENTRIES) {
    // Evict oldest ~10% of entries (Map iteration is insertion-order)
    let pruned = 0
    for (const key of pinOwnership.keys()) {
      pinOwnership.delete(key)
      if (++pruned >= 1_000) break
    }
  }
}

/**
 * POST /api/pins/register
 *
 * Called by the client immediately after a successful Firebase write.
 * Enforces the 1-pin-per-minute rate limit and stores ownership so that
 * PATCH / DELETE can verify the requesting device is the creator.
 *
 * Body:  { pinId: "<firebase-doc-id>" }
 * Header: X-Device-Id: "<uuid-v4>"
 */
app.post('/api/pins/register', (req, res) => {
  const deviceId = readDeviceId(req)
  if (!deviceId) return res.status(400).json({ error: 'Missing or invalid X-Device-Id header' })

  const pinId = typeof req.body?.pinId === 'string' ? req.body.pinId.slice(0, 128) : null
  if (!pinId) return res.status(400).json({ error: 'Missing pinId in body' })

  if (!checkPinRateLimit(deviceId)) {
    return res.status(429).json({ error: 'You can only drop one pin per minute. Take a breath! 🌿' })
  }

  pinOwnership.set(pinId, deviceId)
  pruneOwnership()

  res.json({ ok: true })
})

/**
 * PATCH /api/pins/:id
 *
 * Verifies the requesting device owns the pin before the client performs
 * the Firestore update.  Returns 200 { ok: true } on success so the client
 * can proceed; the actual field update is done client-side via Firebase SDK.
 *
 * Header: X-Device-Id: "<uuid-v4>"
 */
app.patch('/api/pins/:id', (req, res) => {
  const deviceId = readDeviceId(req)
  if (!deviceId) return res.status(400).json({ error: 'Missing or invalid X-Device-Id header' })

  const pinId = req.params.id
  const owner = pinOwnership.get(pinId)

  if (!owner)            return res.status(404).json({ error: 'Pin not found or session expired' })
  if (owner !== deviceId) return res.status(403).json({ error: 'You can only edit your own pins' })

  res.json({ ok: true })
})

/**
 * DELETE /api/pins/:id
 *
 * Same ownership check as PATCH.  On success, also removes the entry from
 * the ownership map so the record doesn't linger in memory.
 *
 * Header: X-Device-Id: "<uuid-v4>"
 */
app.delete('/api/pins/:id', (req, res) => {
  const deviceId = readDeviceId(req)
  if (!deviceId) return res.status(400).json({ error: 'Missing or invalid X-Device-Id header' })

  const pinId = req.params.id
  const owner = pinOwnership.get(pinId)

  if (!owner)            return res.status(404).json({ error: 'Pin not found or session expired' })
  if (owner !== deviceId) return res.status(403).json({ error: 'You can only delete your own pins' })

  pinOwnership.delete(pinId)
  res.json({ ok: true })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
