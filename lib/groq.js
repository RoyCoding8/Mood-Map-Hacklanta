const PROVIDERS = {
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    format: 'openai',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    format: 'openai',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    format: 'anthropic',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    format: 'gemini',
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    defaultModel: '',
    format: 'openai',
  },
}

function getProvider() {
  const providerKey = (process.env.LLM_PROVIDER || 'groq').toLowerCase()
  const provider = PROVIDERS[providerKey] || PROVIDERS.groq

  const baseUrl = process.env.LLM_BASE_URL || provider.baseUrl
  const model = process.env.LLM_MODEL || provider.defaultModel
  const apiKey = process.env.LLM_API_KEY || process.env.GROQ_KEY || ''

  return { ...provider, baseUrl, model, apiKey, key: providerKey }
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
const VALID_MOODS = ['happy', 'excited', 'anxious', 'stressed', 'sad']
const POSITIVE_MOODS = ['happy', 'excited']
const TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '15000', 10)

export function requireEnv() {
  const { apiKey, name, key } = getProvider()
  if (!apiKey) {
    throw new Error(
      `LLM API key is not set. Set LLM_API_KEY (or GROQ_KEY for Groq). Current provider: ${name} (${key})`
    )
  }
}

export function setCors(req, res) {
  const origin = req.headers?.origin || req.headers?.Origin || ''
  const allowed = ALLOWED_ORIGINS.length === 0
    ? origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')
    : ALLOWED_ORIGINS.includes(origin)

  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : '')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  // NOTE: CSP should be set on HTML responses (via vercel.json headers or index.html meta tag),
  // not on API JSON responses — setting it here can cause browsers to block cross-origin
  // fetch calls from the Vite dev server.
}

const rateLimitStore = new Map()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '30', 10)

export function checkRateLimit(req) {
  const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown'

  const now = Date.now()
  const record = rateLimitStore.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }

  if (now > record.resetAt) {
    record.count = 1
    record.resetAt = now + RATE_LIMIT_WINDOW_MS
  } else {
    record.count++
  }

  rateLimitStore.set(ip, record)

  if (rateLimitStore.size > 1000) {
    for (const [key, val] of rateLimitStore) {
      if (now > val.resetAt) rateLimitStore.delete(key)
    }
  }

  return record.count <= RATE_LIMIT_MAX
}

export function rateLimitMiddleware(req, res, next) {
  if (!checkRateLimit(req)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' })
  }
  next()
}

function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen)
}

export function validateMood(mood) {
  if (typeof mood !== 'string') return null
  const lower = mood.trim().toLowerCase()
  if (!VALID_MOODS.includes(lower)) return null
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function validatePins(pins, maxItems = 100) {
  if (!Array.isArray(pins)) return null
  const valid = []
  for (const p of pins.slice(0, maxItems)) {
    if (typeof p !== 'object' || p === null) continue
    const lat = Number(p.lat)
    const lng = Number(p.lng)
    const mood = sanitize(String(p.mood || ''), 50)
    if (!isFinite(lat) || !isFinite(lng) || !mood) continue
    valid.push({ lat, lng, mood })
  }
  return valid.length > 0 ? valid : null
}

export function validateEntries(entries, maxItems = 100) {
  if (!Array.isArray(entries)) return null
  const valid = []
  for (const e of entries.slice(0, maxItems)) {
    if (typeof e !== 'object' || e === null) continue
    const time = sanitize(String(e.time || ''), 50)
    const mood = sanitize(String(e.mood || ''), 50)
    const area = sanitize(String(e.area || ''), 100)
    if (!time || !mood || !area) continue
    valid.push({ time, mood, area })
  }
  return valid.length > 0 ? valid : null
}

export function validateMessage(message) {
  if (typeof message !== 'string') return null
  const clean = sanitize(message, 1000)
  return clean.length > 0 ? clean : null
}

export function isPositiveMood(mood) {
  return POSITIVE_MOODS.includes(mood.toLowerCase())
}

async function callOpenAIFormat({ baseUrl, apiKey, model, systemPrompt, userPrompt, maxTokens, signal }) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  })

  if (!response.ok) {
    console.error(`LLM API returned ${response.status}`)
    throw new Error(`AI service error (${response.status})`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

async function callAnthropicFormat({ baseUrl, apiKey, model, systemPrompt, userPrompt, maxTokens, signal }) {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  })

  if (!response.ok) {
    console.error(`Anthropic API returned ${response.status}`)
    throw new Error(`AI service error (${response.status})`)
  }

  const data = await response.json()
  return data.content?.[0]?.text?.trim() || ''
}

async function callGeminiFormat({ baseUrl, apiKey, model, systemPrompt, userPrompt, maxTokens, signal }) {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    signal,
  })

  if (!response.ok) {
    console.error(`Gemini API returned ${response.status}`)
    throw new Error(`AI service error (${response.status})`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
}

export async function callGroq({ systemPrompt, userPrompt, maxTokens = 400 }) {
  const provider = getProvider()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let text = ''

    if (provider.format === 'anthropic') {
      text = await callAnthropicFormat({
        baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model,
        systemPrompt, userPrompt, maxTokens, signal: controller.signal,
      })
    } else if (provider.format === 'gemini') {
      text = await callGeminiFormat({
        baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model,
        systemPrompt, userPrompt, maxTokens, signal: controller.signal,
      })
    } else {
      text = await callOpenAIFormat({
        baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model,
        systemPrompt, userPrompt, maxTokens, signal: controller.signal,
      })
    }

    if (!text) throw new Error('Empty AI response')
    return text
  } finally {
    clearTimeout(timer)
  }
}

export function parseLLMJson(text) {
  try {
    let clean = text.replace(/```json\n?/g, '').replace(/```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) clean = match[0]
    return JSON.parse(clean)
  } catch {
    console.error('Failed to parse LLM JSON:', text?.slice(0, 200))
    return {
      message: text || 'The AI returned an unexpected format. Please try again.',
      action: null,
      joke: null,
      reminder: null,
      musicVibes: null,
      recoveryPrompt: null,
      _parseError: true,
    }
  }
}

export function getBuilding(lat) {
  if (lat >= 33.750 && lat <= 33.752) return 'Library South area'
  if (lat >= 33.748 && lat < 33.750) return 'Student Center area'
  if (lat >= 33.746 && lat < 33.748) return 'Classroom South area'
  return 'Campus area'
}

export function safeError(res, e, context = 'API') {
  console.error(`${context} error:`, e.message)
  const status = e.message?.includes('AI service error') ? 502
    : e.message?.includes('Too many') ? 429
    : 500
  res.status(status).json({ error: 'Something went wrong. Please try again.' })
}
