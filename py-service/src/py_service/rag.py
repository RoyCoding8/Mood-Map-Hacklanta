from __future__ import annotations

import math
from uuid import uuid4

import chromadb
import httpx

from .config import settings


class RAGStore:
    def __init__(self) -> None:
        self.client = chromadb.PersistentClient(path=settings.chroma_path)
        self.collection = self.client.get_or_create_collection(
            name=settings.chroma_collection
        )
        self.http = httpx.Client(timeout=httpx.Timeout(settings.http_timeout_seconds))

    def _truncate(self, text: str, limit: int) -> str:
        return (text or "").strip()[:limit]

    @staticmethod
    def _fallback_embed(text: str, dimensions: int = 128) -> list[float]:
        vector = [0.0] * dimensions
        for idx, char in enumerate(text.lower()):
            bucket = (ord(char) + (idx * 31)) % dimensions
            vector[bucket] += 1.0

        norm = math.sqrt(sum(value * value for value in vector))
        if norm <= 0:
            return vector
        return [value / norm for value in vector]

    def embed_text(self, text: str) -> list[float] | None:
        trimmed = self._truncate(text, settings.max_input_chars)
        if not trimmed:
            return None

        if not settings.gemini_api_key:
            return self._fallback_embed(trimmed)

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_embedding_model}:embedContent?key={settings.gemini_api_key}"
        )
        payload = {"content": {"parts": [{"text": trimmed}]}}

        try:
            response = self.http.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("embedding", {}).get("values")
        except Exception:
            return self._fallback_embed(trimmed)

    def seed_if_empty(self, docs: list[dict]) -> bool:
        if self.collection.count() > 0:
            return False

        ids: list[str] = []
        texts: list[str] = []
        metadatas: list[dict] = []
        embeddings: list[list[float]] = []

        for doc in docs:
            text = self._truncate(str(doc.get("text", "")), 1200)
            embedding = self.embed_text(text)
            if not text or embedding is None:
                continue
            ids.append(str(uuid4()))
            texts.append(text)
            metadatas.append(doc.get("metadata") or {})
            embeddings.append(embedding)

        if ids:
            self.collection.add(
                ids=ids,
                documents=texts,
                metadatas=metadatas,
                embeddings=embeddings,
            )

        return bool(ids)

    def retrieve(self, query: str, top_k: int) -> list[dict]:
        clean_query = self._truncate(query, settings.max_input_chars)
        if not clean_query:
            return []

        query_embedding = self.embed_text(clean_query)

        if query_embedding is None:
            data = self.collection.get(limit=top_k, include=["documents", "metadatas"])
            results = []
            ids = data.get("ids") or []
            docs = data.get("documents") or []
            metas = data.get("metadatas") or []

            for i, item_id in enumerate(ids):
                results.append(
                    {
                        "id": item_id,
                        "text": docs[i] if i < len(docs) else "",
                        "metadata": metas[i] if i < len(metas) and metas[i] else {},
                        "score": 0.0,
                    }
                )
            return results

        out = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        ids = out.get("ids", [[]])[0]
        docs = out.get("documents", [[]])[0]
        metas = out.get("metadatas", [[]])[0]
        dists = out.get("distances", [[]])[0]

        results: list[dict] = []
        for idx, item_id in enumerate(ids):
            dist = (
                float(dists[idx])
                if idx < len(dists) and dists[idx] is not None
                else 1.0
            )
            score = 1.0 / (1.0 + dist)
            results.append(
                {
                    "id": item_id,
                    "text": docs[idx] if idx < len(docs) else "",
                    "metadata": metas[idx] if idx < len(metas) and metas[idx] else {},
                    "score": score,
                }
            )

        return results

    def upsert_documents(self, docs: list[dict]) -> dict:
        ids: list[str] = []
        texts: list[str] = []
        metadatas: list[dict] = []
        embeddings: list[list[float]] = []
        skipped = 0

        for doc in docs:
            text = self._truncate(str(doc.get("text", "")), 12_000)
            metadata = doc.get("metadata") or {}
            provided_id = doc.get("id")
            item_id = str(provided_id).strip() if provided_id else str(uuid4())

            if not text:
                skipped += 1
                continue

            embedding = self.embed_text(text)
            if embedding is None:
                skipped += 1
                continue

            ids.append(item_id)
            texts.append(text)
            metadatas.append(metadata)
            embeddings.append(embedding)

        if ids:
            self.collection.upsert(
                ids=ids,
                documents=texts,
                metadatas=metadatas,
                embeddings=embeddings,
            )

        return {"inserted": len(ids), "skipped": skipped}
