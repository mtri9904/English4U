from __future__ import annotations

import re


SPEAKING_FILLER_PHRASES = (
    "uh",
    "um",
    "erm",
    "ah",
    "you know",
    "i mean",
    "kind of",
    "sort of",
)

SPEAKING_CONNECTOR_PHRASES = (
    "because",
    "so",
    "but",
    "also",
    "however",
    "for example",
    "for instance",
    "personally",
    "in my opinion",
    "first",
    "second",
    "finally",
    "although",
    "while",
)

SPEAKING_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "do", "does",
    "for", "from", "had", "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in",
    "is", "it", "its", "me", "my", "of", "on", "or", "our", "ours", "she", "that", "the",
    "their", "theirs", "them", "they", "this", "to", "us", "was", "we", "were", "with", "you",
    "your", "yours",
}


def extract_speaking_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def count_phrase_occurrences(text: str, phrases: tuple[str, ...]) -> int:
    normalized_text = re.sub(r"\s+", " ", text.lower()).strip()
    normalized = f" {normalized_text} "
    return sum(normalized.count(f" {phrase} ") for phrase in phrases)


def format_percent(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    return f"{round(float(value) * 100)}%"


def shorten_evidence_text(value: str | None, *, max_length: int = 90) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if len(cleaned) <= max_length:
        return cleaned
    return f"{cleaned[:max_length - 1].rstrip()}..."
