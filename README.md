# MoodMap

Anonymous campus emotional pulse app for hackathon demos. Students drop mood pins on a map, get immediate AI support, and counselors can view campus-level trends.

Core app code is JavaScript-only (no TypeScript). A Python `uv` service is now included for RAG and AI orchestration.

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

## Python RAG Service (FastAPI + ChromaDB)

This project now includes a self-contained Python `uv` service at `py-service/`.

- Gemini embeddings power retrieval (`GEMINI_API_KEY`)
- Groq powers chat generation (`GROQ_API_KEY` or existing `LLM_API_KEY`)
- ChromaDB persists local vectors in `py-service/data/chroma`

### Start Python Service

```bash
# from repo root
npm run py:install
npm run py:ingest
npm run py:server
```

Python endpoints:

- `GET /py/health`
- `GET /py/rag/stats`
- `POST /py/chat`
- `POST /py/rag/upsert`
- `POST /py/rag/query`
- `POST /py/comfort`
- `POST /py/journal`
- `POST /py/insights`
- `POST /py/generate-reel-script`

Ingestion:

- Seed corpus files live in `py-service/corpus/`
- Run `npm run py:ingest` to upsert those documents into ChromaDB

Node integration:

- `/api/chat` routes to Python by default and falls back to existing Node/Groq logic if Python is unavailable.
- Additional AI endpoints are proxied to Python by default (`/api/comfort`, `/api/journal`, `/api/insights`, `/api/generate-reel-script`).
- Set `PY_PROXY_EXTRA_ROUTES=0` if you need to temporarily force those endpoints back to Node handlers.

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
| `/api/insights` | Campus mood insights | Yes (Python-proxy by default) | Yes |
| `/api/comfort` | Companion comfort payload | Yes (Python-proxy by default) | Yes |
| `/api/chat` | Companion chat reply | Yes (Python-proxy + safety gate) | Yes |
| `/api/journal` | Daily journal reflection | Yes (Python-proxy by default) | Yes |
| `/api/pin` | Create/update/delete user pins | Yes | Yes |
| `/api/support` | Hug / me-too reactions | Yes | Yes |
| `/api/generate-reel-script` | Reel data generation | Yes | No (not yet in `api/`) |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run server` | Start Express API server |
| `npm run py:install` | Install Python service dependencies via uv |
| `npm run py:server` | Start Python FastAPI service |
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
│   ├── chatSafety.js       # Deterministic L1/L2/L3 safety gate for chat
│   ├── groq.js             # LLM provider layer + validation + CORS + rate limit
│   ├── pinStore.js         # In-memory pin/support store for API routes
│   └── pyClient.js         # Node -> Python proxy client
├── py-service/
│   ├── src/py_service/     # FastAPI app, RAG, schemas, Groq/Gemini clients
│   └── pyproject.toml      # uv project config
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
- Python RAG currently seeds a small starter corpus; add campus-specific documents via `/py/rag/upsert`.

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
