from __future__ import annotations

import httpx

from .config import settings


class GroqClient:
    def __init__(self) -> None:
        self.http = httpx.Client(timeout=httpx.Timeout(settings.http_timeout_seconds))

    @staticmethod
    def _join_context(chunks: list[dict], max_chars: int) -> str:
        lines: list[str] = []
        used = 0
        for idx, chunk in enumerate(chunks, start=1):
            text = (chunk.get("text") or "").strip()
            if not text:
                continue
            line = f"[{idx}] {text}\n"
            if used + len(line) > max_chars:
                break
            lines.append(line)
            used += len(line)
        return "".join(lines)

    def chat_with_context(
        self, mood: str, message: str, chunks: list[dict]
    ) -> tuple[str, bool]:
        context = self._join_context(chunks, settings.max_context_chars)
        if not settings.groq_api_key:
            return (
                "I'm here with you. I could not reach the LLM right now, but campus counseling and trusted people can still help immediately.",
                True,
            )

        system_prompt = (
            f"You are a warm, supportive best friend chatting with a student who is feeling {mood}. "
            "Use provided campus support context when relevant. "
            "Keep replies to 2-4 sentences. No bullet points. No clinical diagnosis. "
            "If safety risk appears, encourage contacting emergency services or campus police."
        )

        user_prompt = (
            f"Student message: {message}\n\n"
            f"Retrieved context:\n{context or '(no retrieved context)'}\n\n"
            "Respond with empathy and practical support."
        )

        payload = {
            "model": settings.groq_model,
            "max_tokens": 260,
            "temperature": 0.3,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }

        try:
            response = self.http.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.groq_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            text = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
                .strip()
            )

            if text:
                return text, False

            return (
                "I'm still here. Tell me a little more about what you're going through right now.",
                True,
            )
        except Exception:
            return (
                "I'm here with you. I hit a temporary issue reaching support AI. If you feel unsafe, call Campus Police or 911 right now.",
                True,
            )


def build_comfort_payload(mood: str, time_of_day: str, pin_number: int) -> dict:
    return {
        "message": f"You're not alone. Feeling {mood.lower()} during the {time_of_day} is more common than you think.",
        "action": "Take 3 slow breaths, unclench your jaw, and sip water.",
        "joke": "Your brain has 47 tabs open — let's close one tab at a time.",
        "reminder": f"This is check-in #{pin_number} today. Showing up for yourself matters.",
        "musicVibes": "Try a calm lo-fi playlist for 10 minutes while you reset.",
        "recoveryPrompt": "What is one small thing that would make the next hour 5% easier?",
    }


def build_journal_summary(entries: list[dict]) -> str:
    if not entries:
        return "You checked in today, and that is already a strong step toward self-awareness."

    first = entries[0]
    last = entries[-1]
    return (
        f"You started around {first.get('time', 'earlier')} feeling {first.get('mood', 'mixed')}. "
        f"By {last.get('time', 'later')}, you were feeling {last.get('mood', 'different')}. "
        "Even when the day is heavy, noticing your patterns is real progress."
    )


def build_insights_payload(pins: list[dict]) -> dict:
    mood_counts: dict[str, int] = {}
    for pin in pins:
        mood = str(pin.get("mood", "Unknown")).strip() or "Unknown"
        mood_counts[mood] = mood_counts.get(mood, 0) + 1

    dominant = max(mood_counts.items(), key=lambda pair: pair[1])[0]
    vibe = dominant
    hotspot = "Student Center area showing the highest emotional concentration."
    alert = f"Prioritize outreach around the current dominant mood: {dominant}."

    return {
        "hotspot": hotspot,
        "dominant": dominant,
        "alert": alert,
        "vibe": vibe,
    }
