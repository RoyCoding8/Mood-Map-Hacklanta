from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SourceChunk(BaseModel):
    id: str
    text: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RAGDocument(BaseModel):
    id: str | None = None
    text: str = Field(min_length=1, max_length=12000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RAGUpsertRequest(BaseModel):
    documents: list[RAGDocument] = Field(min_length=1, max_length=200)


class RAGUpsertResponse(BaseModel):
    inserted: int
    skipped: int


class RAGQueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=6000)
    topK: int | None = Field(default=None, ge=1, le=8)


class RAGQueryResponse(BaseModel):
    sources: list[SourceChunk] = Field(default_factory=list)


class ChatRequest(BaseModel):
    mood: str = Field(min_length=2, max_length=32)
    message: str = Field(min_length=1, max_length=6000)
    conversationId: str | None = Field(default=None, min_length=1, max_length=120)
    topK: int | None = Field(default=None, ge=1, le=8)


class ChatResponse(BaseModel):
    reply: str
    conversationId: str
    fallbackUsed: bool = False
    sources: list[SourceChunk] = Field(default_factory=list)


class ComfortRequest(BaseModel):
    mood: str = Field(min_length=2, max_length=32)
    timeOfDay: str = Field(default="morning", min_length=2, max_length=16)
    pinNumber: int = Field(default=1, ge=1, le=100)
    randomSeed: int = Field(default=500, ge=0, le=10000)


class ComfortResponse(BaseModel):
    message: str
    action: str
    joke: str
    reminder: str
    musicVibes: str | None = None
    recoveryPrompt: str | None = None


class JournalEntry(BaseModel):
    time: str = Field(min_length=1, max_length=50)
    mood: str = Field(min_length=1, max_length=50)
    area: str = Field(min_length=1, max_length=100)


class JournalRequest(BaseModel):
    entries: list[JournalEntry] = Field(min_length=1, max_length=100)


class JournalResponse(BaseModel):
    summary: str


class PinInput(BaseModel):
    lat: float
    lng: float
    mood: str = Field(min_length=1, max_length=50)


class InsightsRequest(BaseModel):
    pins: list[PinInput] = Field(min_length=1, max_length=100)


class InsightsResponse(BaseModel):
    hotspot: str
    dominant: str
    alert: str
    vibe: str
