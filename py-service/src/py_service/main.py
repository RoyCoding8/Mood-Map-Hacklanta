from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import settings
from .llm import (
    GroqClient,
    build_comfort_payload,
    build_insights_payload,
    build_journal_summary,
)
from .rag import RAGStore
from .schemas import (
    ChatRequest,
    ChatResponse,
    ComfortRequest,
    ComfortResponse,
    InsightsRequest,
    InsightsResponse,
    JournalRequest,
    JournalResponse,
    RAGQueryRequest,
    RAGQueryResponse,
    RAGUpsertRequest,
    RAGUpsertResponse,
    SourceChunk,
)

app = FastAPI(title=settings.app_name)
rag = RAGStore()
groq = GroqClient()

SEED_DOCS = [
    {
        "text": "Campus Counseling Center offers free confidential counseling Monday-Friday 8am-6pm. Walk-ins are welcome.",
        "metadata": {"source": "campus_services", "type": "policy"},
    },
    {
        "text": "If you feel physically unsafe, call 911 immediately or Georgia State University Police at 404-413-3333.",
        "metadata": {"source": "crisis_contacts", "type": "emergency"},
    },
    {
        "text": "When anxiety spikes, try a 60-second reset: inhale 4, hold 4, exhale 6, repeat 5 times.",
        "metadata": {"source": "wellness_toolkit", "type": "coping"},
    },
    {
        "text": "Peer support groups meet Tuesday and Thursday evenings at the Student Center. You can join anonymously.",
        "metadata": {"source": "peer_support", "type": "resource"},
    },
]


@app.on_event("startup")
def startup_event() -> None:
    rag.seed_if_empty(SEED_DOCS)


@app.get("/py/rag/stats")
def rag_stats() -> dict:
    return {
        "ok": True,
        "collection": settings.chroma_collection,
        "count": rag.collection.count(),
    }


@app.get("/py/health")
def health() -> dict:
    return {
        "ok": True,
        "collection": settings.chroma_collection,
        "count": rag.collection.count(),
    }


@app.post("/py/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    message = request.message.strip()[: settings.max_input_chars]
    mood = request.mood.strip()[:32]
    top_k = request.topK or settings.top_k_default
    top_k = max(1, min(top_k, settings.top_k_max))

    sources_raw = rag.retrieve(message, top_k)
    reply, fallback_used = groq.chat_with_context(mood, message, sources_raw)

    conversation_id = request.conversationId or "session-anon"
    sources = [SourceChunk(**chunk) for chunk in sources_raw]

    return ChatResponse(
        reply=reply,
        conversationId=conversation_id,
        fallbackUsed=fallback_used,
        sources=sources,
    )


@app.post("/py/rag/upsert", response_model=RAGUpsertResponse)
def rag_upsert(request: RAGUpsertRequest) -> RAGUpsertResponse:
    payload = [doc.model_dump() for doc in request.documents]
    stats = rag.upsert_documents(payload)
    return RAGUpsertResponse(inserted=stats["inserted"], skipped=stats["skipped"])


@app.post("/py/rag/query", response_model=RAGQueryResponse)
def rag_query(request: RAGQueryRequest) -> RAGQueryResponse:
    query = request.query.strip()[: settings.max_input_chars]
    top_k = request.topK or settings.top_k_default
    top_k = max(1, min(top_k, settings.top_k_max))
    chunks = rag.retrieve(query, top_k)
    return RAGQueryResponse(sources=[SourceChunk(**chunk) for chunk in chunks])


@app.post("/py/comfort", response_model=ComfortResponse)
def comfort(request: ComfortRequest) -> ComfortResponse:
    payload = build_comfort_payload(request.mood, request.timeOfDay, request.pinNumber)
    return ComfortResponse(**payload)


@app.post("/py/journal", response_model=JournalResponse)
def journal(request: JournalRequest) -> JournalResponse:
    entries = [entry.model_dump() for entry in request.entries]
    summary = build_journal_summary(entries)
    return JournalResponse(summary=summary)


@app.post("/py/insights", response_model=InsightsResponse)
def insights(request: InsightsRequest) -> InsightsResponse:
    pins = [pin.model_dump() for pin in request.pins]
    payload = build_insights_payload(pins)
    return InsightsResponse(**payload)


@app.post("/py/generate-reel-script")
def generate_reel_script(payload: dict) -> dict:
    pins = payload.get("pins") or []
    total_pins = len(pins)

    mood_counts: dict[str, int] = {}
    for pin in pins:
        mood = str(pin.get("mood", "Stressed")).strip() or "Stressed"
        mood_counts[mood] = mood_counts.get(mood, 0) + 1

    dominant = (
        max(mood_counts.items(), key=lambda item: item[1])[0]
        if mood_counts
        else "Stressed"
    )
    breakdown = []
    if total_pins > 0:
        for mood, count in sorted(
            mood_counts.items(), key=lambda item: item[1], reverse=True
        ):
            breakdown.append(
                {
                    "mood": mood,
                    "count": count,
                    "pct": round((count / total_pins) * 100),
                }
            )

    return {
        "data": {
            "totalPins": total_pins,
            "dominantMood": dominant,
            "day": "Today",
            "time": "Now",
            "aiHeadline": "CAMPUS VIBE CHECK",
            "aiTagline": "the campus never lies.",
            "topLocations": [],
            "moodBreakdown": breakdown,
            "storyHighlights": [],
        }
    }


@app.exception_handler(Exception)
def unhandled_exception_handler(_, __):
    return JSONResponse(
        status_code=500,
        content={"error": "Python AI service failed. Please try again."},
    )


def main() -> None:
    import uvicorn

    uvicorn.run(
        "py_service.main:app", host=settings.host, port=settings.port, reload=False
    )
