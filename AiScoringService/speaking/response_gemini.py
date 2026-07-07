from __future__ import annotations

import logging

from gemini_utils import generate_structured_content_with_gemini_async
from schemas import RubricScore, StructuredSpeakingGeminiResult
from settings import GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES
from speaking.band_utils import clamp_band, round_band_half
from speaking.rubric_v3 import (
    get_llm_refiner_criteria,
    get_part_guidance_note,
    speaking_refiner_prompt_notes,
)

logger = logging.getLogger(__name__)

SPEAKING_GEMINI_RUBRICS = get_llm_refiner_criteria()


def build_speaking_gemini_prompt(
    transcript: str,
    *,
    question_prompt: str | None,
    part_number: int | None,
    prompt_type: str | None,
    features: dict[str, float | int | None],
    rule_rubric_bands: dict[str, float],
) -> str:
    part_context = get_part_guidance_note(part_number, prompt_type)
    rubric_guidance = speaking_refiner_prompt_notes(SPEAKING_GEMINI_RUBRICS)
    metric_lines = [
        f"- Word count: {int(features['word_count'] or 0)}",
        f"- Words per minute: {features['words_per_minute'] if features['words_per_minute'] is not None else 'n/a'}",
        f"- Pause ratio: {round(float(features['pause_ratio'] or 0.0) * 100, 1)}%",
        f"- Speech ratio: {round(float(features['speech_ratio'] or 0.0) * 100, 1)}%",
        f"- Silero VAD available: {'yes' if int(features.get('vad_engine_available') or 0) == 1 else 'no'}",
        "- Speaker diarization: disabled for submit scoring; submitted answers are treated as candidate-only audio.",
        f"- Filler ratio: {round(float(features['filler_ratio'] or 0.0) * 100, 1)}%",
        f"- Connector count: {int(features['connector_count'] or 0)}",
        f"- Unique word ratio: {round(float(features['unique_ratio'] or 0.0) * 100, 1)}%",
        f"- Lexical sophistication score: {features.get('lexical_sophistication_score') if features.get('lexical_sophistication_score') is not None else 'n/a'}",
        f"- Advanced/rare/common content-word ratios: {round(float(features.get('lexical_advanced_word_ratio') or 0.0) * 100, 1)}% / {round(float(features.get('lexical_rare_word_ratio') or 0.0) * 100, 1)}% / {round(float(features.get('lexical_common_word_ratio') or 0.0) * 100, 1)}%",
        f"- Lexical MTLD/HDD: {features.get('lexical_mtld') if features.get('lexical_mtld') is not None else 'n/a'} / {features.get('lexical_hdd') if features.get('lexical_hdd') is not None else 'n/a'}",
        f"- Average words per sentence unit: {round(float(features['avg_words_per_sentence'] or 0.0), 1)}",
        f"- LanguageTool grammar available: {'yes' if int(features.get('grammar_engine_available') or 0) == 1 else 'no'}",
        f"- LanguageTool grammar errors: {int(features.get('grammar_error_count') or 0)}",
        f"- LanguageTool weighted error density: {float(features.get('grammar_error_density_per_100_words') or 0.0):.2f}/100 words",
        f"- Grammar complexity score: {features.get('grammar_complexity_score') if features.get('grammar_complexity_score') is not None else 'n/a'}",
        f"- Subordinate clause markers: {int(features.get('grammar_subordinate_clause_count') or 0)}",
        f"- Tense/modal variety markers: {int(features.get('grammar_tense_marker_variety') or 0)} tense groups, {int(features.get('grammar_modal_verb_count') or 0)} modals",
    ]
    rubric_anchor_lines = "\n".join(
        f"- {criteria}: {band:.1f}"
        for criteria, band in rule_rubric_bands.items()
        if criteria in SPEAKING_GEMINI_RUBRICS
    )
    metrics_block = "\n".join(metric_lines)
    topic_block = question_prompt.strip() if question_prompt and question_prompt.strip() else "No explicit prompt provided."

    return f"""You are assisting an IELTS Speaking scoring engine.
Assess the response using the IELTS-style Speaking rubric contract below.

{rubric_guidance}

Important rules:
- Score ONLY these 3 criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy.
- Do NOT score Pronunciation here because the main scoring engine handles it from audio-backed signals.
- Bands must be IELTS bands from 0 to 9 in 0.5 increments.
- Consider the rule-based anchor bands below as reference guides, but evaluate and assign the final bands independently based on the transcript and observed signals.
- Compensate for ASR (Speech-to-Text) errors: The transcript may contain phonetic misrecognitions, spelling mistakes, or nonsense phrases introduced by the transcriber (e.g. 'muscle-free' instead of 'carefree', or garbled phrases like 'she says Annie's gift bought'). Do not penalize the candidate for these obvious transcriber anomalies. Evaluate the candidate's likely intended grammatical structure and vocabulary.
- Distinguish spoken speech markers from errors: Repetitions (e.g., 'it's, it's, it's'), hesitations, self-corrections, and fillers (e.g., 'well', 'you know') are natural in spoken English. Do not penalize these markers as if they were written grammatical or fluency errors. Focus on the candidate's overall communicative flow and structural complexity.
- Keep comments concise, concrete, and in Vietnamese.
- Keep improvements specific, practical, and in Vietnamese.

Speaking context:
- Interview part: {part_number if part_number is not None else "unknown"}
- Part guidance: {part_context}
- Question/topic: {topic_block}

Observed signals:
{metrics_block}

Rule-based anchor bands:
{rubric_anchor_lines}

Candidate transcript:
\"\"\"
{transcript.strip()}
\"\"\"

Return ONLY valid JSON in this exact format:
{{
  "rubrics": [
    {
      "criteria": "Fluency and Coherence",
      "band": 6.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    },
    {
      "criteria": "Lexical Resource",
      "band": 6.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    },
    {
      "criteria": "Grammatical Range and Accuracy",
      "band": 6.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }
  ]
}}"""


def normalize_speaking_gemini_result(
    result: StructuredSpeakingGeminiResult,
) -> dict[str, RubricScore]:
    normalized: dict[str, RubricScore] = {}

    for rubric in result.rubrics:
        matched_criteria = next(
            (
                criteria
                for criteria in SPEAKING_GEMINI_RUBRICS
                if criteria.lower() == rubric.criteria.strip().lower()
            ),
            None,
        )
        if matched_criteria is None or matched_criteria in normalized:
            continue

        normalized[matched_criteria] = RubricScore(
            criteria=matched_criteria,
            band=round_band_half(clamp_band(rubric.band)),
            comment=rubric.comment.strip() or "Gemini chưa trả nhận xét đủ rõ cho tiêu chí này.",
            improvements=rubric.improvements.strip() or "Cần luyện thêm tiêu chí này với câu trả lời tự nhiên hơn.",
        )

    return normalized


async def maybe_get_speaking_gemini_rubrics(
    transcript: str,
    *,
    question_prompt: str | None,
    answer_id: str,
    part_number: int | None,
    prompt_type: str | None,
    features: dict[str, float | int | None],
    rule_rubric_bands: dict[str, float],
    gemini_client: object | None,
) -> dict[str, RubricScore]:
    if gemini_client is None or int(features["word_count"] or 0) < 8:
        return {}

    try:
        result = await generate_structured_content_with_gemini_async(
            gemini_client,
            prompt=build_speaking_gemini_prompt(
                transcript,
                question_prompt=question_prompt,
                part_number=part_number,
                prompt_type=prompt_type,
                features=features,
                rule_rubric_bands=rule_rubric_bands,
            ),
            system_instruction=(
                "You are an IELTS Speaking examiner assistant. "
                "Return only valid JSON matching the requested schema."
            ),
            response_schema=StructuredSpeakingGeminiResult,
            model_candidates=GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES,
            error_context="speaking scoring",
            max_output_tokens=1200,
        )
        return normalize_speaking_gemini_result(result)
    except Exception:  # pragma: no cover
        logger.exception("Gemini speaking rubric refinement failed for answer %s.", answer_id)
        return {}
