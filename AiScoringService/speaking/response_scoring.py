from __future__ import annotations

import asyncio

from faster_whisper.transcribe import Segment

from schemas import (
    RubricScore,
    SpeakingAudioQuality,
    SpeakingEvidence,
)
from speaking.audio_activity import analyze_speaking_speech_activity
from speaking.band_utils import (
    clamp_speaking_band_to_rule_window,
    round_band_half,
)
from speaking.grammar import (
    analyze_speaking_grammar_with_languagetool,
    build_grammar_feature_map,
)
from speaking.lexical import (
    analyze_speaking_lexical,
    build_lexical_feature_map,
)
from speaking.response_evidence import (
    build_no_response_speaking_result,
    build_rubric_confidence,
    build_rubric_evidence,
    build_speaking_comment,
    build_speaking_evidence_payload,
)
from speaking.response_features import (
    build_speaking_feature_map,
    normalize_speaking_prompt_type,
)
from speaking.response_gemini import maybe_get_speaking_gemini_rubrics
from speaking.response_rules import build_rule_rubric_bands
from speaking.text_utils import extract_speaking_tokens



async def score_speaking_rubrics(
    transcript: str,
    *,
    answer_id: str,
    question_prompt: str | None,
    part_number: int | None,
    prompt_type: str | None,
    target_duration_seconds: float | None,
    duration_seconds: float | None,
    segments: list[Segment],
    audio_quality: SpeakingAudioQuality | None,
    audio_path: str | None = None,
    gemini_client: object | None = None,
) -> tuple[list[RubricScore], str, SpeakingEvidence]:
    normalized_prompt_type = normalize_speaking_prompt_type(part_number, prompt_type)
    vad_analysis = await asyncio.to_thread(
        analyze_speaking_speech_activity,
        audio_path,
        duration_seconds=duration_seconds,
    )
    features = build_speaking_feature_map(
        transcript,
        segments,
        part_number=part_number,
        prompt_type=normalized_prompt_type,
        target_duration_seconds=target_duration_seconds,
        duration_seconds=duration_seconds,
        vad_analysis=vad_analysis,
    )
    features.update({
        "speaker_diarization_enabled": 0,
        "speaker_count": 1 if audio_path else 0,
        "speaker_turn_count": 0,
        "primary_speaker_ratio": 1.0 if audio_path else None,
    })
    grammar_analysis = await asyncio.to_thread(
        analyze_speaking_grammar_with_languagetool,
        transcript,
        word_count=int(features["word_count"] or 0),
    )
    lexical_analysis = await asyncio.to_thread(analyze_speaking_lexical, transcript)
    features.update(build_lexical_feature_map(lexical_analysis))
    features.update(build_grammar_feature_map(grammar_analysis))
    evidence_payload = build_speaking_evidence_payload(
        features=features,
        segments=segments,
        audio_quality=audio_quality,
        audio_path=audio_path,
        prompt_type=normalized_prompt_type,
        transcript=transcript,
        lexical_analysis=lexical_analysis,
        grammar_analysis=grammar_analysis,
        vad_analysis=vad_analysis,
        diarization_analysis=None,
    )
    word_count = int(features["word_count"] or 0)
    technical_low_confidence = (
        audio_quality is not None
        and not audio_quality.is_usable
        and word_count < 8
    )
    if not extract_speaking_tokens(transcript) or technical_low_confidence:
        rubrics, overall_feedback = build_no_response_speaking_result(
            duration_seconds,
            evidence_payload,
        )
        return rubrics, overall_feedback, evidence_payload

    audio_backed = bool(segments)
    rule_rubric_bands = build_rule_rubric_bands(
        features=features,
        evidence=evidence_payload,
        part_number=part_number,
        prompt_type=normalized_prompt_type,
        audio_quality=audio_quality,
        audio_backed=audio_backed,
    )

    gemini_rubrics = await maybe_get_speaking_gemini_rubrics(
        transcript,
        question_prompt=question_prompt,
        answer_id=answer_id,
        part_number=part_number,
        prompt_type=normalized_prompt_type,
        features=features,
        rule_rubric_bands=rule_rubric_bands,
        gemini_client=gemini_client,
    )

    rubrics: list[RubricScore] = []
    final_rubric_bands: dict[str, float] = {}

    for criteria, rule_band in rule_rubric_bands.items():
        rule_comment, rule_improvements = build_speaking_comment(
            criteria=criteria,
            band=rule_band,
            features=features,
            audio_backed=audio_backed,
        )
        gemini_rubric = gemini_rubrics.get(criteria)
        final_band = (
            clamp_speaking_band_to_rule_window(rule_band, gemini_rubric.band)
            if gemini_rubric is not None
            else rule_band
        )
        rubrics.append(RubricScore(
            criteria=criteria,
            band=final_band,
            comment=gemini_rubric.comment if gemini_rubric is not None else rule_comment,
            improvements=gemini_rubric.improvements if gemini_rubric is not None else rule_improvements,
            confidence=build_rubric_confidence(
                criteria=criteria,
                features=features,
                evidence=evidence_payload,
                audio_backed=audio_backed,
            ),
            evidence=build_rubric_evidence(
                criteria=criteria,
                features=features,
                evidence=evidence_payload,
            ),
        ))
        final_rubric_bands[criteria] = final_band

    strongest = sorted(final_rubric_bands.items(), key=lambda item: item[1], reverse=True)[:2]
    weakest = sorted(final_rubric_bands.items(), key=lambda item: item[1])[:2]
    overall_band = round_band_half(sum(final_rubric_bands.values()) / len(final_rubric_bands))
    overall_feedback = (
        f"Ước lượng band Speaking hiện tại khoảng {overall_band:.1f}. "
        f"Điểm mạnh tương đối nằm ở {', '.join(criteria for criteria, _ in strongest)}. "
        f"Hai ưu tiên nên luyện tiếp là {', '.join(criteria for criteria, _ in weakest)}."
    )
    return rubrics, overall_feedback, evidence_payload
