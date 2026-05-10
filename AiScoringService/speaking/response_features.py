from __future__ import annotations

import math
import re

from faster_whisper.transcribe import Segment

from schemas import SpeakingVadAnalysis, SpeakingWordTimestamp
from speaking.audio_evidence import (
    build_speaking_pause_stats,
    calculate_speech_ratio,
    flatten_speaking_words,
    get_speaking_pauses,
)
from speaking.text_utils import (
    SPEAKING_CONNECTOR_PHRASES,
    SPEAKING_FILLER_PHRASES,
    SPEAKING_STOPWORDS,
    count_phrase_occurrences,
    extract_speaking_tokens,
)


def normalize_speaking_prompt_type(part_number: int | None, prompt_type: str | None = None) -> str:
    normalized = (prompt_type or "").strip().lower().replace("-", "_")
    if normalized in {"part2_long_turn", "cue_card", "long_turn"}:
        return "part2_long_turn"
    if normalized in {"part2_follow_up", "follow_up", "short_response"}:
        return "part2_follow_up" if part_number == 2 else "short_response"
    if part_number == 1:
        return "part1_short_answer"
    if part_number == 2:
        return "part2_follow_up"
    if part_number == 3:
        return "part3_discussion"
    return "unknown"


def get_speaking_target_duration_seconds(
    part_number: int | None,
    prompt_type: str | None = None,
    target_duration_seconds: float | None = None,
) -> float | None:
    if target_duration_seconds is not None and target_duration_seconds > 0:
        return target_duration_seconds

    normalized_prompt_type = normalize_speaking_prompt_type(part_number, prompt_type)
    if part_number == 1:
        return 30.0
    if normalized_prompt_type == "part2_long_turn":
        return 120.0
    if normalized_prompt_type == "part2_follow_up":
        return 35.0
    if part_number == 3:
        return 60.0
    return None


def infer_duration_seconds(segments: list[Segment], fallback_duration_seconds: float | None) -> float | None:
    if fallback_duration_seconds is not None and fallback_duration_seconds > 0:
        return fallback_duration_seconds

    word_ends = [
        word.end
        for segment in segments
        for word in (segment.words or [])
        if word.end is not None
    ]
    if word_ends:
        return max(word_ends)

    segment_ends = [segment.end for segment in segments if segment.end is not None]
    if segment_ends:
        return max(segment_ends)

    return None


def build_word_timestamp_evidence(segments: list[Segment], *, limit: int = 500) -> list[SpeakingWordTimestamp]:
    words = flatten_speaking_words(segments)
    return [
        SpeakingWordTimestamp(
            word=word.word.strip(),
            start=round(word.start, 2) if word.start is not None else None,
            end=round(word.end, 2) if word.end is not None else None,
            probability=round(float(word.probability), 3) if word.probability is not None else None,
        )
        for word in words[:limit]
    ]


def build_low_confidence_word_evidence(
    word_timestamps: list[SpeakingWordTimestamp],
    *,
    threshold: float = 0.65,
    limit: int = 12,
) -> list[SpeakingWordTimestamp]:
    low_confidence_words = [
        item
        for item in word_timestamps
        if item.probability is not None and item.probability < threshold
    ]
    return sorted(
        low_confidence_words,
        key=lambda item: (item.probability if item.probability is not None else 1.0, item.start or 0.0),
    )[:limit]


def build_speaking_feature_map(
    transcript: str,
    segments: list[Segment],
    *,
    part_number: int | None,
    prompt_type: str | None,
    target_duration_seconds: float | None,
    duration_seconds: float | None,
    vad_analysis: SpeakingVadAnalysis | None = None,
) -> dict[str, float | int | None]:
    tokens = extract_speaking_tokens(transcript)
    total_words = len(tokens)
    unique_ratio = (len(set(tokens)) / total_words) if total_words else 0.0
    content_tokens = [token for token in tokens if token not in SPEAKING_STOPWORDS]
    content_ratio = (len(content_tokens) / total_words) if total_words else 0.0
    long_word_ratio = (
        sum(1 for token in tokens if len(token) >= 7) / total_words
        if total_words
        else 0.0
    )
    filler_count = count_phrase_occurrences(transcript, SPEAKING_FILLER_PHRASES)
    filler_ratio = filler_count / max(total_words, 1)
    connector_count = count_phrase_occurrences(transcript, SPEAKING_CONNECTOR_PHRASES)

    consecutive_repetitions = sum(
        1
        for index in range(1, total_words)
        if tokens[index] == tokens[index - 1]
    )
    repetition_ratio = (
        consecutive_repetitions / max(total_words - 1, 1)
        if total_words > 1
        else 0.0
    )

    punctuation_sentences = len(re.findall(r"[.!?]", transcript))
    sentence_units = max(1, punctuation_sentences or len(segments) or 1)
    avg_words_per_sentence = total_words / sentence_units if sentence_units else float(total_words)

    effective_duration_seconds = infer_duration_seconds(segments, duration_seconds)
    words_per_minute = (
        round((total_words / effective_duration_seconds) * 60, 1)
        if total_words and effective_duration_seconds and effective_duration_seconds > 0
        else None
    )

    flat_words = flatten_speaking_words(segments)

    if flat_words:
        word_probabilities = [
            float(word.probability)
            for word in flat_words
            if word.probability is not None
        ]
        mean_word_probability = (
            sum(word_probabilities) / len(word_probabilities)
            if word_probabilities
            else 0.0
        )
        low_confidence_ratio = (
            sum(1 for probability in word_probabilities if probability < 0.55) / len(word_probabilities)
            if word_probabilities
            else 0.0
        )
    else:
        derived_probabilities = [
            max(0.05, min(0.99, math.exp(segment.avg_logprob)))
            for segment in segments
        ]
        mean_word_probability = (
            sum(derived_probabilities) / len(derived_probabilities)
            if derived_probabilities
            else 0.0
        )
        low_confidence_ratio = (
            sum(1 for probability in derived_probabilities if probability < 0.55) / len(derived_probabilities)
            if derived_probabilities
            else 0.0
        )

    asr_pauses = get_speaking_pauses(segments, flat_words)
    asr_pause_stats = build_speaking_pause_stats(asr_pauses)
    asr_pause_ratio = (
        asr_pause_stats.total_pause_seconds / effective_duration_seconds
        if effective_duration_seconds and effective_duration_seconds > 0
        else 0.0
    )
    vad_ready = bool(vad_analysis is not None and vad_analysis.is_available and vad_analysis.segment_count > 0)
    pause_stats = vad_analysis.pause_stats if vad_ready and vad_analysis is not None else asr_pause_stats
    total_pause_seconds = pause_stats.total_pause_seconds
    pause_ratio = (
        total_pause_seconds / effective_duration_seconds
        if effective_duration_seconds and effective_duration_seconds > 0
        else 0.0
    )
    avg_no_speech_prob = (
        sum(segment.no_speech_prob for segment in segments) / len(segments)
        if segments
        else None
    )
    effective_target_duration_seconds = get_speaking_target_duration_seconds(
        part_number,
        prompt_type,
        target_duration_seconds,
    )
    coverage_ratio = (
        effective_duration_seconds / effective_target_duration_seconds
        if effective_duration_seconds and effective_target_duration_seconds and effective_target_duration_seconds > 0
        else None
    )

    asr_speech_ratio = calculate_speech_ratio(
        segments,
        duration_seconds=effective_duration_seconds,
        flat_words=flat_words,
    )
    speech_ratio = (
        vad_analysis.speech_ratio
        if vad_ready and vad_analysis is not None and vad_analysis.speech_ratio is not None
        else asr_speech_ratio
    )

    return {
        "word_count": total_words,
        "unique_ratio": unique_ratio,
        "content_ratio": content_ratio,
        "long_word_ratio": long_word_ratio,
        "filler_count": filler_count,
        "filler_ratio": filler_ratio,
        "connector_count": connector_count,
        "repetition_ratio": repetition_ratio,
        "sentence_units": sentence_units,
        "avg_words_per_sentence": avg_words_per_sentence,
        "duration_seconds": effective_duration_seconds,
        "words_per_minute": words_per_minute,
        "mean_word_probability": mean_word_probability,
        "low_confidence_ratio": low_confidence_ratio,
        "asr_confidence": mean_word_probability if segments else None,
        "pause_ratio": pause_ratio,
        "pause_count": pause_stats.pause_count,
        "long_pause_count": pause_stats.long_pause_count,
        "total_pause_seconds": pause_stats.total_pause_seconds,
        "average_pause_seconds": pause_stats.average_pause_seconds,
        "longest_pause_seconds": pause_stats.longest_pause_seconds,
        "speech_ratio": speech_ratio,
        "asr_speech_ratio": asr_speech_ratio,
        "asr_pause_ratio": asr_pause_ratio,
        "vad_engine_available": 1 if vad_ready else 0,
        "vad_segment_count": vad_analysis.segment_count if vad_analysis is not None else 0,
        "vad_speech_ratio": vad_analysis.speech_ratio if vad_analysis is not None else None,
        "avg_no_speech_prob": avg_no_speech_prob,
        "target_duration_seconds": effective_target_duration_seconds,
        "coverage_ratio": coverage_ratio,
    }
