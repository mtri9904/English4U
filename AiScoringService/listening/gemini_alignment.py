from __future__ import annotations

import asyncio
import logging
import re
import time

from google.genai import types as google_genai_types

from schemas import (
    GeminiAlignmentQuotaExhaustedError,
    ListeningAlignmentQuestion,
    ListeningAlignmentSelectionBatch,
)
from settings import GEMINI_ALIGNMENT_MODEL_CANDIDATES


logger = logging.getLogger(__name__)

gemini_alignment_quota_cooldown_until = 0.0


def iter_exception_chain(ex: Exception):
    current: Exception | None = ex
    seen: set[int] = set()

    while current is not None and id(current) not in seen:
        yield current
        seen.add(id(current))
        next_error = current.__cause__ or current.__context__
        current = next_error if isinstance(next_error, Exception) else None


def extract_quota_retry_delay_seconds(ex: Exception) -> float | None:
    patterns = [
        r"retry in\s+([0-9]+(?:\.[0-9]+)?)s",
        r"'retrydelay':\s*'([0-9]+)s'",
        r'"retryDelay":\s*"([0-9]+)s"',
    ]

    for error in iter_exception_chain(ex):
        message = str(error)
        for pattern in patterns:
            match = re.search(pattern, message, flags=re.IGNORECASE)
            if match:
                try:
                    return max(1.0, float(match.group(1)))
                except ValueError:
                    continue

    return None


def is_gemini_quota_exhausted_error(ex: Exception) -> bool:
    quota_markers = [
        "resource_exhausted",
        "quota exceeded",
        "exceeded your current quota",
        "generate_requestsperday",
        "generatecontentinputtokenspermodelperday",
        "retrydelay",
    ]

    for error in iter_exception_chain(ex):
        if getattr(error, "status_code", None) == 429:
            return True

        message = str(error).lower()
        if any(marker in message for marker in quota_markers):
            return True

    return False


def is_gemini_alignment_quota_on_cooldown() -> bool:
    return gemini_alignment_quota_cooldown_until > time.monotonic()


def set_gemini_alignment_quota_cooldown(delay_seconds: float | None) -> None:
    global gemini_alignment_quota_cooldown_until

    if delay_seconds is None:
        delay_seconds = 45.0

    gemini_alignment_quota_cooldown_until = max(
        gemini_alignment_quota_cooldown_until,
        time.monotonic() + delay_seconds,
    )


def build_alignment_batch_prompt(batch_questions: list[tuple[ListeningAlignmentQuestion, list[dict]]]) -> str:
    ordered_question_numbers = [question.question_number for question, _ in batch_questions]
    batch_start_question = min(ordered_question_numbers) if ordered_question_numbers else 0
    batch_end_question = max(ordered_question_numbers) if ordered_question_numbers else 0
    blocks: list[str] = []

    for question, candidates in batch_questions:
        candidate_lines = []
        for candidate in candidates:
            candidate_lines.append(
                f"- Candidate {candidate['candidate_id']} | segments {candidate['segment_indexes']} | "
                f"[{candidate['time_label']}] {candidate['text']}"
            )

        blocks.append(
            "\n".join([
                f"Question {question.question_number}",
                f"Question text: {question.question_text or ''}",
                f"Correct answer: {question.correct_answer or ''}",
                f"Correct option texts: {', '.join(question.correct_option_texts or [])}",
                f"Context: {question.context_text or ''}",
                f"Group type: {question.group_type or ''}",
                "Rule: choose exactly one single candidate segment that directly states or clearly paraphrases the evidence.",
                "Rule: never choose greetings, instructions, introductions, scene-setting, or broad topic/setup lines.",
                "Rule: if no candidate is reliable, return null instead of guessing.",
                "Candidates:",
                *candidate_lines,
            ]).strip()
        )

    return (
        "You are aligning IELTS Listening questions to exact transcript segments.\n"
        f"This batch only covers questions {batch_start_question} to {batch_end_question}.\n"
        f"Return exactly {len(batch_questions)} selections: one for every listed question number, with no omissions and no extra question numbers.\n"
        "For each question, choose exactly one candidate_id whose single segment directly contains the spoken evidence for the correct answer.\n"
        "Use exact wording, spelled forms, and clear paraphrases.\n"
        "Do not choose based only on broad topic similarity.\n"
        "Do not choose greetings, instructions, scene-setting, introductions, or summary/setup lines.\n"
        "If one candidate mentions the topic generally and another candidate gives the actual answer detail, choose the actual answer detail.\n"
        "Do not reuse the same candidate for multiple different questions unless the exact same spoken evidence genuinely answers both.\n"
        "If none of the candidates clearly supports the correct answer, return null for candidate_id.\n\n"
        + "\n\n---\n\n".join(blocks)
    )


async def generate_alignment_batch_with_gemini_split(
    batch_questions: list[tuple[ListeningAlignmentQuestion, list[dict]]],
    gemini_client: object,
) -> ListeningAlignmentSelectionBatch:
    prompt = build_alignment_batch_prompt(batch_questions)

    try:
        return await asyncio.to_thread(
            generate_alignment_batch_with_gemini,
            prompt,
            gemini_client,
        )
    except GeminiAlignmentQuotaExhaustedError:
        raise
    except Exception:
        if len(batch_questions) <= 4:
            raise

        midpoint = len(batch_questions) // 2
        left_result = await generate_alignment_batch_with_gemini_split(batch_questions[:midpoint], gemini_client)
        right_result = await generate_alignment_batch_with_gemini_split(batch_questions[midpoint:], gemini_client)
        return ListeningAlignmentSelectionBatch(
            selections=[
                *left_result.selections,
                *right_result.selections,
            ]
        )


def generate_alignment_batch_with_gemini(
    prompt: str,
    gemini_client: object,
) -> ListeningAlignmentSelectionBatch:
    if gemini_client is None:
        raise RuntimeError("Gemini client is not configured.")

    if is_gemini_alignment_quota_on_cooldown():
        raise GeminiAlignmentQuotaExhaustedError(
            "Gemini alignment is temporarily on quota cooldown."
        )

    last_error: Exception | None = None
    saw_quota_error = False
    saw_non_quota_error = False
    for model_name in GEMINI_ALIGNMENT_MODEL_CANDIDATES:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=google_genai_types.GenerateContentConfig(
                    system_instruction=(
                        "You align IELTS Listening questions to transcript candidates. "
                        "Return only valid JSON that matches the requested schema."
                    ),
                    response_mime_type="application/json",
                    response_schema=ListeningAlignmentSelectionBatch,
                    temperature=0.1,
                    candidate_count=1,
                    max_output_tokens=2048,
                ),
            )
            if isinstance(response.parsed, ListeningAlignmentSelectionBatch):
                return response.parsed

            if isinstance(response.text, str) and response.text.strip():
                return ListeningAlignmentSelectionBatch.model_validate_json(response.text)

            raise RuntimeError(f"Gemini model {model_name} returned no structured alignment payload.")
        except Exception as ex:  # pragma: no cover
            last_error = ex
            if is_gemini_quota_exhausted_error(ex):
                saw_quota_error = True
                set_gemini_alignment_quota_cooldown(extract_quota_retry_delay_seconds(ex))
                logger.warning("Gemini alignment model %s quota exhausted.", model_name)
                continue

            saw_non_quota_error = True
            logger.exception("Gemini alignment model %s failed.", model_name)

    if saw_quota_error and not saw_non_quota_error:
        raise GeminiAlignmentQuotaExhaustedError(
            "All Gemini alignment model candidates are quota exhausted."
        ) from last_error

    raise RuntimeError("All Gemini alignment model candidates failed.") from last_error
