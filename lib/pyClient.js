const DEFAULT_BASE_URL = 'http://127.0.0.1:8000'
const DEFAULT_TIMEOUT_MS = 8_000

const PY_SERVICE_BASE_URL = (process.env.PY_SERVICE_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')

function resolveTimeoutMs(customTimeoutMs) {
  const parsed = Number.parseInt(customTimeoutMs ?? process.env.PY_SERVICE_TIMEOUT_MS, 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return DEFAULT_TIMEOUT_MS
}

function buildUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${PY_SERVICE_BASE_URL}${normalized}`
}

export async function postPyJson(path, payload, options = {}) {
  const timeoutMs = resolveTimeoutMs(options.timeoutMs)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    })

    const raw = await response.text()
    let json = null
    if (raw) {
      try { json = JSON.parse(raw) } catch { json = null }
    }

    if (!response.ok) {
      const detail = json?.detail || json?.error || raw || `HTTP ${response.status}`
      throw new Error(`Python service error (${response.status}): ${detail}`)
    }

    if (!json || typeof json !== 'object') {
      throw new Error('Python service returned a non-JSON response')
    }

    return json
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Python service timeout after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export function getPyServiceBaseUrl() {
  return PY_SERVICE_BASE_URL
}

export async function getPyHealth(options = {}) {
  const timeoutMs = resolveTimeoutMs(options.timeoutMs)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(buildUrl('/py/health'), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    const raw = await response.text()
    let json = null
    if (raw) {
      try { json = JSON.parse(raw) } catch { json = null }
    }

    if (!response.ok || !json || typeof json !== 'object') {
      throw new Error('Python health check failed')
    }

    return json
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Python service timeout after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function callPyChat({ mood, message, conversationId }) {
  const payload = { mood, message }
  if (conversationId) payload.conversationId = conversationId
  return postPyJson('/py/chat', payload)
}
