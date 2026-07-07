from __future__ import annotations

import logging

from gemini_utils import generate_structured_content_with_gemini_async
from schemas import (
    RubricScore,
    ScoreSpeakingSessionRequest,
    SpeakingSessionAnswerInput,
    SpeakingSessionRubricInput,
    StructuredSpeakingSessionResult,
)
from settings import GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES
from speaking.band_utils import (
    clamp_speaking_band_to_rule_window,
    round_band_half,
)
from speaking.rubric_v3 import get_speaking_criteria, speaking_refiner_prompt_notes
from speaking.text_utils import extract_speaking_tokens, shorten_evidence_text

logger = logging.getLogger(__name__)

SPEAKING_RUBRICS = get_speaking_criteria()
COMPLETE_SESSION_PARTS = {1, 2, 3}


def is_no_response_session_answer(answer: SpeakingSessionAnswerInput) -> bool:
    if answer.no_response:
        return True
    if not extract_speaking_tokens(answer.transcript_text or ""):
        return True
    rubric_bands = [
        round_band_half(rubric.band)
        for rubric in answer.rubrics
        if rubric.criteria and rubric.criteria.strip()
    ]
    return bool(rubric_bands) and max(rubric_bands) <= 1.0


def get_session_answer_rubric(
    answer: SpeakingSessionAnswerInput,
    criteria: str,
) -> SpeakingSessionRubricInput | None:
    return next(
        (
            rubric
            for rubric in answer.rubrics
            if rubric.criteria.strip().lower() == criteria.lower()
        ),
        None,
    )


def average_optional(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def parse_session_part_numbers(value: object) -> set[int]:
    if not isinstance(value, str):
        return set()
    part_numbers: set[int] = set()
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            part_numbers.add(int(item))
        except ValueError:
            continue
    return part_numbers


def has_complete_session_coverage(metrics: dict[str, float | int | str]) -> bool:
    ratable_parts = parse_session_part_numbers(metrics.get("ratable_parts"))
    total_word_count = int(metrics.get("total_word_count") or 0)
    no_response_ratio = float(metrics.get("no_response_ratio") or 0.0)
    return (
        COMPLETE_SESSION_PARTS.issubset(ratable_parts)
        and total_word_count >= 250
        and no_response_ratio < 0.25
    )


def get_session_refiner_max_adjustment(metrics: dict[str, float | int | str]) -> float:
    if not has_complete_session_coverage(metrics):
        return 0.5

    total_word_count = int(metrics.get("total_word_count") or 0)
    no_response_ratio = float(metrics.get("no_response_ratio") or 0.0)
    if total_word_count >= 650 and no_response_ratio == 0:
        return 1.5
    return 1.0


def get_session_coverage_bonus(
    *,
    criteria: str,
    metrics: dict[str, float | int | str],
    base_band: float,
) -> float:
    base_anchor = round_band_half(base_band)
    if not has_complete_session_coverage(metrics) or base_anchor < 5.5:
        return 0.0

    total_word_count = int(metrics.get("total_word_count") or 0)
    bonus = 0.5
    if total_word_count >= 650 and base_anchor >= 6.0:
        bonus = 0.75

    if criteria == "Pronunciation":
        return min(bonus, 0.5)
    return bonus


def build_session_rubric_evidence(
    *,
    criteria: str,
    metrics: dict[str, float | int | str],
    base_band: float,
    coverage_bonus: float,
) -> list[str]:
    return [
        "aggregation=session_level_weighted_by_part",
        f"criterion_base_band={base_band:.1f}",
        f"session_coverage_bonus={coverage_bonus:.2f}",
        f"total_prompts={int(metrics['total_answers'])}",
        f"ratable_prompts={int(metrics['ratable_answers'])}",
        f"no_response_prompts={int(metrics['no_response_answers'])}",
        f"ratable_parts={metrics['ratable_parts']}",
        f"complete_session_coverage={metrics['complete_session_coverage']}",
        f"session_word_count={int(metrics['total_word_count'])}",
        f"session_refiner_max_adjustment={float(metrics['session_refiner_max_adjustment']):.1f}",
    ]


def build_speaking_session_deterministic_result(
    request: ScoreSpeakingSessionRequest,
) -> tuple[list[RubricScore], str, dict[str, float | int | str]]:
    answers = request.answers
    total_answers = len(answers)
    no_response_answers = [answer for answer in answers if is_no_response_session_answer(answer)]
    ratable_answers = [answer for answer in answers if not is_no_response_session_answer(answer)]
    total_word_count = sum(len(extract_speaking_tokens(answer.transcript_text or "")) for answer in answers)

    part_numbers = sorted({answer.part_number or 0 for answer in answers}) or [0]
    ratable_part_numbers = sorted({answer.part_number or 0 for answer in ratable_answers})
    part_weights = {1: 1.0, 2: 1.2, 3: 1.2, 0: 1.0}
    no_response_ratio = len(no_response_answers) / total_answers if total_answers else 1.0

    metrics: dict[str, float | int | str] = {
        "total_answers": total_answers,
        "ratable_answers": len(ratable_answers),
        "no_response_answers": len(no_response_answers),
        "total_word_count": total_word_count,
        "no_response_ratio": no_response_ratio,
        "ratable_parts": ",".join(str(part) for part in ratable_part_numbers) if ratable_part_numbers else "none",
        "configured_parts": ",".join(str(part) for part in part_numbers),
    }
    metrics["complete_session_coverage"] = "yes" if has_complete_session_coverage(metrics) else "no"
    metrics["session_refiner_max_adjustment"] = get_session_refiner_max_adjustment(metrics)

    rubrics: list[RubricScore] = []
    for criteria in SPEAKING_RUBRICS:
        weighted_total = 0.0
        weight_total = 0.0
        confidence_values: list[float] = []

        for part_number in part_numbers:
            part_answers = [answer for answer in answers if (answer.part_number or 0) == part_number]
            part_bands: list[float] = []

            for answer in part_answers:
                rubric = get_session_answer_rubric(answer, criteria)
                if rubric is None:
                    continue
                part_bands.append(round_band_half(rubric.band))
                if rubric.confidence is not None:
                    confidence_values.append(max(0.0, min(1.0, float(rubric.confidence))))

            if not part_bands:
                continue

            part_average = sum(part_bands) / len(part_bands)
            part_weight = part_weights.get(part_number, 1.0)
            weighted_total += part_average * part_weight
            weight_total += part_weight

        base_band = weighted_total / weight_total if weight_total else 0.0
        final_band = base_band
        coverage_bonus = 0.0

        if not ratable_answers:
            final_band = 1.0
        else:
            coverage_bonus = get_session_coverage_bonus(
                criteria=criteria,
                metrics=metrics,
                base_band=base_band,
            )
            final_band += coverage_bonus

            if total_word_count < 12:
                final_band = min(final_band, 4.0)
            elif total_word_count < 25:
                final_band = min(final_band, 5.0)
            elif total_word_count < 60 and len(part_numbers) >= 2:
                final_band = min(final_band, 6.0)

            if len(ratable_part_numbers) <= 1 and len(part_numbers) >= 3:
                final_band = min(final_band, 5.5)
            elif len(ratable_part_numbers) < min(2, len(part_numbers)):
                final_band = min(final_band, 6.0)

            if no_response_ratio >= 0.5:
                final_band = min(final_band, 5.0)
            elif no_response_ratio >= 0.25:
                final_band = min(final_band, 6.0)

        confidence = average_optional(confidence_values)
        if confidence is None:
            confidence = 0.72 if ratable_answers else 0.88
        if no_response_ratio >= 0.25:
            confidence -= 0.08
        if total_word_count < 25:
            confidence -= 0.1

        rounded_base_band = round_band_half(base_band)
        rounded_final_band = round_band_half(final_band)
        rubrics.append(RubricScore(
            criteria=criteria,
            band=rounded_final_band,
            comment=(
                "Điểm tiêu chí này được tổng hợp ở cấp toàn session, cân bằng theo từng Part và có cap khi thiếu dữ liệu trả lời. "
                f"Band nền từ các prompt là khoảng {rounded_base_band:.1f}; band sau kiểm tra coverage là {rounded_final_band:.1f}."
            ),
            improvements=(
                "Ưu tiên luyện đủ cả 3 Part và giữ mỗi câu trả lời có bằng chứng ngôn ngữ rõ ràng; "
                "band cuối sẽ ổn định hơn khi hệ thống có đủ long turn, discussion và audio rõ."
            ),
            confidence=round(min(0.95, max(0.1, confidence)), 2),
            evidence=build_session_rubric_evidence(
                criteria=criteria,
                metrics=metrics,
                base_band=rounded_base_band,
                coverage_bonus=coverage_bonus,
            ),
        ))

    overall_band = round_band_half(sum(rubric.band for rubric in rubrics) / len(rubrics)) if rubrics else 0.0
    strongest = sorted(rubrics, key=lambda rubric: rubric.band, reverse=True)[:2]
    weakest = sorted(rubrics, key=lambda rubric: rubric.band)[:2]
    overall_feedback = (
        f"Band Speaking tổng quan theo session khoảng {overall_band:.1f}. "
        "Điểm này dùng toàn bộ câu trả lời trong session thay vì chỉ lấy trung bình từng prompt rời rạc. "
        f"Hệ thống nhận {len(ratable_answers)}/{total_answers} prompt có đủ transcript/audio để đánh giá, "
        f"tổng khoảng {total_word_count} từ, các Part có dữ liệu chấm được: {metrics['ratable_parts']}. "
        f"Điểm mạnh tương đối: {', '.join(rubric.criteria for rubric in strongest)}. "
        f"Ưu tiên cải thiện: {', '.join(rubric.criteria for rubric in weakest)}."
    )
    return rubrics, overall_feedback, metrics


def build_speaking_session_gemini_prompt(
    request: ScoreSpeakingSessionRequest,
    *,
    deterministic_rubrics: list[RubricScore],
    metrics: dict[str, float | int | str],
) -> str:
    rubric_guidance = speaking_refiner_prompt_notes(SPEAKING_RUBRICS)
    session_refiner_max_adjustment = float(metrics.get("session_refiner_max_adjustment") or 0.5)
    anchor_lines = "\n".join(
        f"- {rubric.criteria}: {rubric.band:.1f}"
        for rubric in deterministic_rubrics
    )
    answer_blocks: list[str] = []
    for index, answer in enumerate(request.answers, start=1):
        rubric_line = ", ".join(
            f"{rubric.criteria}={round_band_half(rubric.band):.1f}"
            for rubric in answer.rubrics
            if rubric.criteria
        ) or "no rubric"
        transcript = shorten_evidence_text(answer.transcript_text, max_length=700) or "No transcript."
        answer_blocks.append(
            f"Prompt {index} | part={answer.part_number or 'unknown'} | type={answer.prompt_type or 'unknown'} | "
            f"duration={answer.duration_seconds if answer.duration_seconds is not None else 'n/a'}s | "
            f"no_response={is_no_response_session_answer(answer)}\n"
            f"Question: {shorten_evidence_text(answer.question_prompt, max_length=220) or 'n/a'}\n"
            f"Prompt bands: {rubric_line}\n"
            f"Transcript: {transcript}"
        )

    return f"""You are an IELTS Speaking examiner assistant producing a final session-level judgement.
Use the IELTS-style Speaking rubric contract below.

{rubric_guidance}

Important rules:
- Score the candidate's average performance across the whole speaking session, not each prompt in isolation.
- Use the deterministic anchor bands as guardrails. Keep each criterion within +/- {session_refiner_max_adjustment:.1f} band(s) of its anchor.
- Compensate for ASR (Speech-to-Text) errors: The transcripts for individual prompts may contain phonetic misrecognitions, spelling mistakes, or nonsense phrases introduced by the transcriber (e.g. 'muscle-free' instead of 'carefree', or garbled phrases like 'she says Annie's gift bought'). Do not penalize the candidate for these transcriber anomalies. Evaluate their likely intended grammatical structure and vocabulary choice across the session.
- Distinguish spoken speech markers from errors: Repetitions (e.g., 'it's, it's, it's'), hesitations, self-corrections, and fillers are normal in spoken English. Do not penalize them as written grammatical errors. Grade the candidate's fluency and grammar complexity generously, matching a real human examiner.
- Penalize missing/no-response prompts and insufficient language evidence.
- Keep comments and improvements concise, concrete, and in Vietnamese.

Session metrics:
- Total prompts: {metrics['total_answers']}
- Ratable prompts: {metrics['ratable_answers']}
- No-response prompts: {metrics['no_response_answers']}
- Total transcript word count: {metrics['total_word_count']}
- Configured parts: {metrics['configured_parts']}
- Ratable parts: {metrics['ratable_parts']}
- Complete session coverage: {metrics['complete_session_coverage']}
- Refiner adjustment window: +/- {session_refiner_max_adjustment:.1f}

Deterministic session anchor bands:
{anchor_lines}

Prompt evidence:
{chr(10).join(answer_blocks)}

Return ONLY valid JSON in this exact format:
{{
  "overall_band": 7.0,
  "overall_feedback": "Nhận xét tổng quan ngắn bằng tiếng Việt.",
  "rubrics": [
    {{"criteria":"Fluency and Coherence","band":7.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}},
    {{"criteria":"Lexical Resource","band":7.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}},
    {{"criteria":"Grammatical Range and Accuracy","band":6.5,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}},
    {{"criteria":"Pronunciation","band":7.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}}
  ]
}}"""


async def maybe_get_speaking_session_gemini_result(
    request: ScoreSpeakingSessionRequest,
    *,
    deterministic_rubrics: list[RubricScore],
    metrics: dict[str, float | int | str],
    gemini_client: object | None,
) -> StructuredSpeakingSessionResult | None:
    if gemini_client is None or int(metrics["ratable_answers"] or 0) == 0:
        return None

    try:
        return await generate_structured_content_with_gemini_async(
            gemini_client,
            prompt=build_speaking_session_gemini_prompt(
                request,
                deterministic_rubrics=deterministic_rubrics,
                metrics=metrics,
            ),
            system_instruction=(
                "You are an IELTS Speaking examiner assistant. "
                "Return only valid JSON matching the requested schema."
            ),
            response_schema=StructuredSpeakingSessionResult,
            model_candidates=GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES,
            error_context="speaking session scoring",
            max_output_tokens=1600,
        )
    except Exception:  # pragma: no cover
        logger.exception("Gemini speaking session scoring failed for session %s.", request.session_id)
        return None


def merge_speaking_session_result(
    deterministic_rubrics: list[RubricScore],
    deterministic_feedback: str,
    gemini_result: StructuredSpeakingSessionResult | None,
    metrics: dict[str, float | int | str] | None = None,
) -> tuple[list[RubricScore], str]:
    if gemini_result is None:
        return deterministic_rubrics, deterministic_feedback

    max_adjustment = float(
        (metrics or {}).get("session_refiner_max_adjustment")
        or get_session_refiner_max_adjustment(metrics or {})
    )
    deterministic_lookup = {rubric.criteria: rubric for rubric in deterministic_rubrics}
    gemini_lookup = {
        rubric.criteria.strip().lower(): rubric
        for rubric in gemini_result.rubrics
        if rubric.criteria and rubric.criteria.strip()
    }

    merged: list[RubricScore] = []
    for criteria in SPEAKING_RUBRICS:
        fallback = deterministic_lookup[criteria]
        gemini_rubric = gemini_lookup.get(criteria.lower())
        if gemini_rubric is None:
            merged.append(fallback)
            continue

        merged.append(RubricScore(
            criteria=criteria,
            band=clamp_speaking_band_to_rule_window(
                fallback.band,
                round_band_half(gemini_rubric.band),
                max_adjustment=max_adjustment,
            ),
            comment=gemini_rubric.comment.strip() or fallback.comment,
            improvements=gemini_rubric.improvements.strip() or fallback.improvements,
            confidence=fallback.confidence,
            evidence=fallback.evidence,
        ))

    return merged, (gemini_result.overall_feedback or "").strip() or deterministic_feedback


async def score_speaking_session_rubrics(
    request: ScoreSpeakingSessionRequest,
    *,
    gemini_client: object | None,
) -> tuple[list[RubricScore], str, float]:
    deterministic_rubrics, deterministic_feedback, metrics = build_speaking_session_deterministic_result(request)
    gemini_result = await maybe_get_speaking_session_gemini_result(
        request,
        deterministic_rubrics=deterministic_rubrics,
        metrics=metrics,
        gemini_client=gemini_client,
    )
    final_rubrics, final_feedback = merge_speaking_session_result(
        deterministic_rubrics,
        deterministic_feedback,
        gemini_result,
        metrics,
    )
    overall_band = round_band_half(sum(rubric.band for rubric in final_rubrics) / len(final_rubrics))
    logger.info(
        "Speaking session scoring for session %s: Overall=%s, Metrics=%s, Deterministic=%s, GeminiResult=%s",
        request.session_id,
        overall_band,
        metrics,
        {r.criteria: r.band for r in deterministic_rubrics},
        gemini_result.model_dump_json() if gemini_result else None,
    )
    return final_rubrics, final_feedback, overall_band
