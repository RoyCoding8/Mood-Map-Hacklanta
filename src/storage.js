function encode(data) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(data)))) }
  catch { return JSON.stringify(data) }
}

function decode(raw) {
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw))))
  } catch {
    try { return JSON.parse(raw) }
    catch { return null }
  }
}

export function getTodayStr() {
  return new Date().toISOString().split('T')[0]
}

export function initJournalPins() {
  const today = getTodayStr()
  if (localStorage.getItem('moodmap_journal_date') !== today) {
    localStorage.setItem('moodmap_journal_date', today)
    localStorage.setItem('moodmap_journal_pins', encode([]))
    localStorage.removeItem('moodmap_journal_summary')
    return []
  }
  return decode(localStorage.getItem('moodmap_journal_pins')) || []
}

export function saveJournalPins(pins) {
  localStorage.setItem('moodmap_journal_pins', encode(pins))
}

export function initStreak() {
  return {
    count: parseInt(localStorage.getItem('moodmap_streak_count') || '0'),
    last:  localStorage.getItem('moodmap_streak_last') || ''
  }
}

export function bumpStreak() {
  const today = getTodayStr()
  const { count, last } = initStreak()
  if (last === today) return { count, last }
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().split('T')[0]
  const newCount = last === yStr ? count + 1 : 1
  localStorage.setItem('moodmap_streak_count', String(newCount))
  localStorage.setItem('moodmap_streak_last', today)
  return { count: newCount, last: today }
}

export function loadRecoveryStories() {
  return decode(localStorage.getItem('moodmap_recovery_stories')) || []
}

export function saveRecoveryStories(s) {
  localStorage.setItem('moodmap_recovery_stories', encode(s))
}

// ── Supported pins ───────────────────────────────────────────────────────────
// Tracks which pin IDs this device has already sent support to.
// Persisted as a plain JSON array — no obfuscation needed (not sensitive).
const SUPPORTED_KEY = 'moodmap_supported_pins'

export function getSupportedPins() {
  try {
    const raw = localStorage.getItem(SUPPORTED_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

export function addSupportedPin(pinId) {
  try {
    const current = getSupportedPins()
    current.add(String(pinId))
    // Cap at 1 000 entries so the key never grows unbounded
    const trimmed = [...current].slice(-1_000)
    localStorage.setItem(SUPPORTED_KEY, JSON.stringify(trimmed))
  } catch {}
}

// ── Shadow ID (Device Token) ──────────────────────────────────────────────────
// Generates a cryptographically secure UUID v4 on first call and persists it
// in localStorage. Completely anonymous — no account, no server registration.
export function getDeviceId() {
  const KEY = 'moodmap_device_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()          // native SubtleCrypto — no polyfill needed
    localStorage.setItem(KEY, id)
  }
  return id
}
