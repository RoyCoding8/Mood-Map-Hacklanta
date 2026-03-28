import { getDeviceId } from './storage'

const BASE = import.meta.env.PROD ? '' : 'http://localhost:3001'

const FETCH_TIMEOUT = 20_000

// method defaults to POST; pass null for body on PATCH/DELETE (no body needed)
async function apiFetch(url, body, method = 'POST') {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),   // Shadow ID attached to every request
      },
      // Omit body entirely for DELETE / bodyless PATCH to satisfy strict servers
      body: body !== null ? JSON.stringify(body) : undefined,
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

// ── Pin ownership API ─────────────────────────────────────────────────────────

/**
 * Rate-limit check + ownership registration.
 * Must be called after the Firebase write so we have the real Firestore doc ID.
 * Returns { ok: true } or throws on rate-limit (429) / validation error (400).
 */
export async function registerPin(pinId) {
  return apiFetch(`${BASE}/api/pins/register`, { pinId })
}

/**
 * Verify the current device owns `pinId` before performing an update.
 * Returns { ok: true } or throws 403 if ownership doesn't match.
 */
export async function verifyPinUpdate(pinId) {
  return apiFetch(`${BASE}/api/pins/${encodeURIComponent(pinId)}`, null, 'PATCH')
}

/**
 * Verify the current device owns `pinId` before performing a delete.
 * Returns { ok: true } or throws 403 if ownership doesn't match.
 * Also removes the pin from the server's ownership map.
 */
export async function verifyPinDelete(pinId) {
  return apiFetch(`${BASE}/api/pins/${encodeURIComponent(pinId)}`, null, 'DELETE')
}
