# MoodMap

Anonymous campus emotional pulse app for hackathon demos. Students drop mood pins on a map, get immediate AI support, and counselors can view campus-level trends.

This codebase is JavaScript-only (no TypeScript).

## Implemented Features

### Student Experience

- Anonymous mood pin drop on an interactive campus map
- Quick check-in buttons (drop mood near campus center instantly)
- AI Companion panel with personalized comfort message, action, reminder, and music suggestion
- AI chat inside Companion with optional voice input (SpeechRecognition) and read-aloud replies (SpeechSynthesis)
- Mood update flow for your own pins (including optional recovery story sharing)
- Recovery Stories feed with hearts
- Happy Places: positive check-ins can be opened for others to join
- Daily mood journal timeline, streak tracking, and AI-generated daily reflection

### Counselor / Operations Experience

- Live mood breakdown and live activity feed
- AI campus insights (`vibe`, `hotspot`, `dominant`, `alert`)
- Crisis Mode panel with action confirmations
- Resolution Mode animation to mark response progress
- Simulate Stress Wave demo action
- Emergency counselor banner when high-risk chat language is detected

### Safety and Platform Controls

- 3-level emergency keyword detection in chat (L1, L2, L3)
- L3 full-screen emergency overlay with one-tap 911 and campus police call actions
- API input validation, rate limiting, timeout handling, and security headers
- Device ID-based anti-spam controls for `/api/pin` and `/api/support`
- Light/dark theme toggle with persisted preference and reduced-motion awareness

### Media / Demo

- AI-generated "Campus Vibe Check" reel data
- In-browser reel player with animation timeline
- Record and download reel as `.webm`
- Hidden demo shortcuts: `Ctrl+Shift+R` (reset controls), `Ctrl+Shift+S` (secret stress wave)

## Quick Start

```bash
# 1) Install dependencies
npm install

# 2) Configure environment
# Windows (cmd)
copy .env.example .env
# macOS/Linux
# cp .env.example .env

# 3) Start backend API server (terminal 1)
npm run server

# 4) Start frontend dev server (terminal 2)
npm run dev
```

Windows helper script:

- `run.bat` starts backend + frontend for local demo

## LLM Provider Support

Set `LLM_PROVIDER` in `.env`.

| Provider | `LLM_PROVIDER` | Default Model | API Key Env |
|----------|----------------|---------------|-------------|
| Groq | `groq` | `llama-3.3-70b-versatile` | `LLM_API_KEY` or `GROQ_KEY` |
| OpenAI | `openai` | `gpt-4o-mini` | `LLM_API_KEY` |
| Anthropic | `anthropic` | `claude-sonnet-4-20250514` | `LLM_API_KEY` |
| Google Gemini | `gemini` | `gemini-2.0-flash` | `LLM_API_KEY` |
| Custom (OpenAI-compatible) | `custom` | set `LLM_MODEL` | `LLM_API_KEY` |

For OpenAI-compatible providers (Together, Fireworks, Mistral, etc.), set `LLM_PROVIDER=custom` and `LLM_BASE_URL`.

## API Routes

| Route | Purpose | Express (`server.js`) | Vercel `api/` |
|-------|---------|------------------------|---------------|
| `/api/insights` | Campus mood insights | Yes | Yes |
| `/api/comfort` | Companion comfort payload | Yes | Yes |
| `/api/chat` | Companion chat reply | Yes | Yes |
| `/api/journal` | Daily journal reflection | Yes | Yes |
| `/api/pin` | Create/update/delete user pins | Yes | Yes |
| `/api/support` | Hug / me-too reactions | Yes | Yes |
| `/api/generate-reel-script` | Reel data generation | Yes | No (not yet in `api/`) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run server` | Start Express API server |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |

## Project Structure

```
.
├── api/                    # Vercel serverless functions
│   ├── chat.js
│   ├── comfort.js
│   ├── insights.js
│   ├── journal.js
│   ├── pin.js
│   └── support.js
├── lib/
│   ├── groq.js             # LLM provider layer + validation + CORS + rate limit
│   └── pinStore.js         # In-memory pin/support store for API routes
├── src/
│   ├── __tests__/          # Utility tests (emergency detect + JSON parser)
│   ├── components/         # UI modules
│   ├── App.jsx             # Main app shell and state orchestration
│   ├── api.js              # Frontend API client
│   ├── constants.js
│   ├── storage.js
│   └── utils.js
├── public/reel-assets/     # Reel background assets
├── server.js               # Local Express API server
└── vercel.json             # Vercel frontend config + headers/rewrites
```

## Current Limitations

- `lib/pinStore.js` is in-memory only (data resets when server restarts).
- Seed pins shown on initial map are frontend demo data and are not persisted to backend.
- `/api/support` can only resolve pins known to backend store (works for pins created via `/api/pin`).
- Reel generation endpoint is available in local Express but not yet mirrored as a Vercel function file.

## Testing

Current tests cover:

- Emergency keyword level detection (`detectLevel`)
- Robust LLM JSON parsing (`parseLLMJson`)

Run with:

```bash
npm test
```

## License

MIT
