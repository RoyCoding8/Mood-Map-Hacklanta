from __future__ import annotations

import json
from pathlib import Path

from .rag import RAGStore

SUPPORTED_EXTENSIONS = {".md", ".txt", ".json"}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore").strip()


def _load_json_records(path: Path) -> list[dict]:
    raw = path.read_text(encoding="utf-8", errors="ignore").strip()
    if not raw:
        return []
    data = json.loads(raw)

    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return []

    docs = []
    for item in data:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        docs.append(
            {
                "id": item.get("id"),
                "text": text,
                "metadata": item.get("metadata") or {},
            }
        )
    return docs


def collect_docs(corpus_dir: Path) -> list[dict]:
    docs: list[dict] = []
    if not corpus_dir.exists():
        return docs

    for path in sorted(corpus_dir.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue

        relative = str(path.relative_to(_repo_root())).replace("\\", "/")
        if path.suffix.lower() == ".json":
            for record in _load_json_records(path):
                docs.append(
                    {
                        "id": record.get("id"),
                        "text": record["text"],
                        "metadata": {
                            "source": relative,
                            **(record.get("metadata") or {}),
                        },
                    }
                )
            continue

        text = _load_text_file(path)
        if not text:
            continue
        docs.append(
            {
                "id": relative,
                "text": text,
                "metadata": {
                    "source": relative,
                    "kind": path.suffix.lower().lstrip("."),
                },
            }
        )

    return docs


def main() -> None:
    root = _repo_root()
    corpus_dir = root / "py-service" / "corpus"
    docs = collect_docs(corpus_dir)

    if not docs:
        print("No corpus files found. Add files under py-service/corpus/ and rerun.")
        return

    rag = RAGStore()
    result = rag.upsert_documents(docs)
    print(
        f"Ingestion complete: inserted={result['inserted']}, skipped={result['skipped']}, corpus_files={len(docs)}"
    )


if __name__ == "__main__":
    main()
