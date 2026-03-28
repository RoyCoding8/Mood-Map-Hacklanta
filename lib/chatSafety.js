const L1_WORDS = [
  'scared', 'worried', 'nervous', 'anxious', 'afraid',
  'uncomfortable', 'unsafe feeling', 'uneasy', 'freaked out',
]

const L2_WORDS = [
  'following me', 'someone is watching', 'feel threatened', 'this person',
  'he wont leave', "he won't leave", 'im being', "i'm being",
  'being watched', 'someone following', 'wont leave me alone',
  "won't leave me alone", 'making me uncomfortable', 'keeps following',
]

const L3_WORDS = [
  'help me', 'attack', 'attacked', 'he hit', 'she hit', 'im being attacked',
  "i'm being attacked", 'call police', 'call 911', 'emergency', '911',
  'weapon', 'knife', 'gun', 'bleeding', 'i cant get away', "i can't get away",
  'he wont let me leave', "he won't let me leave", 'going to hurt',
  'going to kill', 'rape', 'kidnap', 'chasing me', 'please help',
  'cant breathe', "can't breathe",
]

export function detectSafetyLevel(text) {
  const lower = String(text || '').toLowerCase().trim()
  if (!lower) return 0
  if (L3_WORDS.some(keyword => lower.includes(keyword))) return 3
  if (L2_WORDS.some(keyword => lower.includes(keyword))) return 2
  if (L1_WORDS.some(keyword => lower.includes(keyword))) return 1
  return 0
}

export function getDeterministicSafetyReply(level) {
  if (level >= 3) {
    return 'This sounds serious. Your safety comes first. Please call 911 or Campus Police immediately. If you cannot call, text 911 in Georgia. Stay in a lit public area. I am here with you.'
  }

  if (level === 2) {
    return "I want to make sure you're okay. Are you in a safe place right now? If you feel physically threatened at any point, please don't hesitate to call Campus Police or 911."
  }

  return null
}
