from __future__ import annotations

import re


def estimate_syllable_count(word: str) -> int:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    if not cleaned:
        return 1
    groups = re.findall(r"[aeiouy]+", cleaned)
    count = len(groups)
    if cleaned.endswith("e") and not cleaned.endswith(("le", "ye")) and count > 1:
        count -= 1
    return max(1, count)


def has_consonant_cluster(word: str) -> bool:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    return bool(re.search(r"[bcdfghjklmnpqrstvwxyz]{3,}", cleaned))


def build_expected_phoneme_profile(word: str) -> str:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    if not cleaned:
        return "unknown"

    parts = [f"syll={estimate_syllable_count(cleaned)}"]
    if has_consonant_cluster(cleaned):
        parts.append("cluster=yes")
    if cleaned.endswith(("p", "t", "k", "b", "d", "g")):
        parts.append("final=stop")
    elif cleaned.endswith(("s", "z", "sh", "ch", "x")):
        parts.append("final=sibilant")
    elif cleaned.endswith(("f", "v", "th")):
        parts.append("final=fricative")
    elif cleaned.endswith(("m", "n", "ng")):
        parts.append("final=nasal")
    return ";".join(parts)[:100]


def build_actual_phoneme_proxy(
    *,
    probability: float | None,
    duration_seconds: float | None,
    issue_type: str | None,
) -> str:
    probability_text = f"asr={probability:.2f}" if probability is not None else "asr=n/a"
    duration_text = f"dur={duration_seconds:.2f}s" if duration_seconds is not None else "dur=n/a"
    issue_text = f"risk={issue_type}" if issue_type else "risk=none"
    return f"{probability_text};{duration_text};{issue_text}"[:100]


def score_prosody_value(value: float, *, ideal: float, tolerance: float) -> float:
    if tolerance <= 0:
        return 0.0
    return round(max(0.0, min(1.0, 1.0 - abs(value - ideal) / tolerance)), 3)
