## MoodMap Python AI/RAG Service

FastAPI service for:

- chat with retrieval context
- Gemini embeddings + ChromaDB retrieval
- Groq chat completions
- RAG ingestion/query endpoints

### Setup

```bash
uv sync
```

### Run

```bash
uv run py-service
```

### Endpoints

- `GET /py/health`
- `POST /py/chat`
- `POST /py/rag/upsert`
- `POST /py/rag/query`
- `POST /py/comfort`
- `POST /py/journal`
- `POST /py/insights`
- `POST /py/generate-reel-script`
