from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CHROMA_PATH = str(BASE_DIR / "data" / "chroma")


def _as_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def _as_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("APP_NAME", "MoodMap Python RAG Service")
    host: str = os.getenv("HOST", "127.0.0.1")
    port: int = _as_int("PORT", 8000)

    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_embedding_model: str = os.getenv(
        "GEMINI_EMBEDDING_MODEL", "text-embedding-004"
    )

    groq_api_key: str = os.getenv(
        "GROQ_API_KEY", os.getenv("LLM_API_KEY", os.getenv("GROQ_KEY", ""))
    )
    groq_model: str = os.getenv(
        "GROQ_MODEL", os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
    )

    chroma_path: str = os.getenv("CHROMA_PATH", DEFAULT_CHROMA_PATH)
    chroma_collection: str = os.getenv("CHROMA_COLLECTION", "moodmap_support_kb")

    http_timeout_seconds: float = _as_float("HTTP_TIMEOUT_SECONDS", 12.0)
    max_input_chars: int = _as_int("MAX_INPUT_CHARS", 1500)
    max_context_chars: int = _as_int("MAX_CONTEXT_CHARS", 3600)
    top_k_default: int = _as_int("TOP_K_DEFAULT", 4)
    top_k_max: int = _as_int("TOP_K_MAX", 8)


settings = Settings()
