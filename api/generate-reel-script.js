// ─── /api/generate-reel-script  (Vercel serverless) ──────────────────────────
import {
  requireEnv, setCors, setSecurityHeaders, checkRateLimit,
  validatePins, callGroq, parseLLMJson, getBuilding, safeError
} from '../lib/groq.js'

requireEnv()

export default async function handler(req, res) {
  setSecurityHeaders(res)
  setCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!checkRateLimit(req)) return res.status(429).json({ error: 'Too many requests' })

  try {
    const pins = validatePins(req.body?.pins)
    if (!pins) return res.status(400).json({ error: 'Invalid or empty pins array' })

    // ── Aggregate mood data by location ────────────────────────────────────
    const locationStats = {}
    const moodTotals = {}

    for (const pin of pins) {
      const area = getBuilding(pin.lat)
      if (!locationStats[area]) locationStats[area] = {}
      locationStats[area][pin.mood] = (locationStats[area][pin.mood] || 0) + 1
      moodTotals[pin.mood] = (moodTotals[pin.mood] || 0) + 1
    }

    // Find top location by total pins
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

    const dataSummary = topLocations
      .map(l => `${l.area}: ${l.total} pins, dominant mood = ${l.dominant} (${JSON.stringify(l.moods)})`)
      .join('\n')

    const now = new Date()
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' })
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    const styles = [
      'narrate like a chaotic sports commentator doing play-by-play',
      'narrate like a dramatic movie trailer voiceover',
      'narrate like a gossip tea-spilling bestie',
      'narrate like a nature documentary narrator observing students',
      'narrate like a weather reporter but for emotions',
      'narrate like an astrology girlie reading campus energy',
      'narrate like a hype man at a concert',
    ]
    const pickedStyle = styles[Math.floor(Math.random() * styles.length)]

    const systemPrompt = `You are a viral TikTok creator making a "Campus Vibe Check" for MoodMap, a college mood-tracking app at GSU (Georgia State University).

STYLE: ${pickedStyle}

Write exactly 5 scenes for a 30-second vertical video. Each scene = ~6 seconds. Be WILDLY creative and different every time. Never repeat the same script twice.

Return ONLY a JSON array of exactly 5 objects:
- "headline": Bold 2-5 word headline, ALL CAPS, punchy (e.g., "LIBRARY STRESS ZONE", "VIBES ARE OFF TODAY")
- "body": 1 dramatic sentence, max 15 words. Make it quotable. Use slang. Be specific to the data.
- "emoji": 1-2 emojis that match the vibe
- "mood": exactly one of: Happy, Excited, Anxious, Stressed, Sad
- "location": specific campus area name OR "Campus-wide"

Scene structure:
1. COLD OPEN — dramatic hook, set the stakes
2-3. LOCATION CALLOUTS — highlight specific spots with specific data
4. TWIST/SURPRISE — unexpected insight or contrast
5. SIGN-OFF — punchy CTA ("Drop your mood. Stay anonymous. This is MoodMap.")

CRITICAL: Be entertaining. Use dramatic pauses (...). Reference actual numbers from the data. No corporate speak.

OUTPUT FORMAT: Return ONLY a valid JSON array. ALL string values MUST be wrapped in double quotes. Example format:
[{"headline": "LIBRARY IS STRESSED", "body": "The vibes are off today.", "emoji": "😬", "mood": "Stressed", "location": "Library South"}]
No markdown. No backticks. No bold markers. Just the raw JSON array.`

    const userPrompt = `${dayName}, ${timeStr}. ${pins.length} total mood pins on campus.
Overall campus aura: ${overallDominant}.

DATA:
${dataSummary}`

    let text = await callGroq({ systemPrompt, userPrompt, maxTokens: 800 })

    // Clean markdown artifacts from LLM response
    text = text
      .replace(/```json\n?/g, '').replace(/```/g, '')
      .replace(/\*\*/g, '')
      .trim()

    // Try to extract a JSON array
    let scenes = null
    const arrMatch = text.match(/\[[\s\S]*\]/)
    if (arrMatch) {
      let jsonStr = arrMatch[0]
      try { scenes = JSON.parse(jsonStr) } catch {
        // Repair: fix unquoted string values
        jsonStr = jsonStr.replace(
          /("(?:headline|body|emoji|mood|location)")\s*:\s*(?!")(.*?)(?=\s*[,}\]])/g,
          (_, key, val) => `${key}: "${val.trim().replace(/"/g, '\\"')}"`
        )
        try { scenes = JSON.parse(jsonStr) } catch {
          console.error('JSON repair failed:', jsonStr.slice(0, 300))
        }
      }
    }

    if (!Array.isArray(scenes)) {
      const parsed = parseLLMJson(text)
      if (Array.isArray(parsed)) scenes = parsed
    }

    if (!Array.isArray(scenes)) {
      // Ultimate fallback — generate generic scenes
      scenes = [
        { headline: 'CAMPUS VIBE CHECK', body: `It's ${dayName} at GSU. Let's see how we're feeling.`, emoji: '🗺️', mood: overallDominant, location: 'Campus-wide' },
        { headline: `${topLocations[0]?.area?.toUpperCase() || 'LIBRARY'} IS ${topLocations[0]?.dominant?.toUpperCase() || 'STRESSED'}`, body: `${topLocations[0]?.total || 0} students checked in here.`, emoji: '📚', mood: topLocations[0]?.dominant || 'Stressed', location: topLocations[0]?.area || 'Library' },
        { headline: `${topLocations[1]?.area?.toUpperCase() || 'STUDENT CENTER'} ENERGY`, body: `The vibe here is ${topLocations[1]?.dominant || 'mixed'}.`, emoji: '⚡', mood: topLocations[1]?.dominant || 'Happy', location: topLocations[1]?.area || 'Student Center' },
        { headline: `OVERALL MOOD: ${overallDominant.toUpperCase()}`, body: `${pins.length} students dropped their mood today.`, emoji: '📊', mood: overallDominant, location: 'Campus-wide' },
        { headline: 'CHECK YOUR AURA', body: 'Drop your mood. Stay anonymous. MoodMap.', emoji: '✨', mood: 'Happy', location: 'Campus-wide' },
      ]
    }

    res.json({
      scenes,
      meta: {
        totalPins: pins.length,
        dominantMood: overallDominant,
        generatedAt: now.toISOString(),
        day: dayName,
        time: timeStr,
      }
    })
  } catch (e) {
    safeError(res, e, 'ReelScript')
  }
}
