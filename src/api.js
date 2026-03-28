const BASE = import.meta.env.PROD ? '' : 'http://localhost:3001'

const FETCH_TIMEOUT = 20_000

async function apiFetch(url, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      let msg = 'Something went wrong'
      try {
        const err = await response.json()
        if (err.error) msg = err.error
      } catch {
        msg = response.statusText || msg
      }

      if (response.status === 429) msg = 'Too many requests — please wait a moment'
      throw new Error(msg)
    }

    return await response.json()
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Request timed out — please try again')
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function getAIInsights(pins) {
  if (pins.length === 0) return null
  return apiFetch(`${BASE}/api/insights`, { pins })
}

export async function getAIComfort(mood, extras = {}) {
  return apiFetch(`${BASE}/api/comfort`, { mood, ...extras })
}

export async function getAIChat(mood, message) {
  return apiFetch(`${BASE}/api/chat`, { mood, message })
}

export async function getJournalSummary(entries) {
  return apiFetch(`${BASE}/api/journal`, { entries })
}
