from __future__ import annotations

from gemini_utils import build_scoring_prompt, call_scoring_model
from schemas import ScoreResponse, ScoreWritingRequest

WRITING_RUBRICS = [
    "Task Achievement",
    "Coherence and Cohesion",
    "Lexical Resource",
    "Grammatical Range and Accuracy",
]


async def score_writing_response(
    request: ScoreWritingRequest,
    *,
    gemini_client: object | None,
) -> ScoreResponse:
    if not request.essay_text.strip():
        raise ValueError("Essay text is empty.")

    prompt = build_scoring_prompt(
        text=request.essay_text,
        rubrics=WRITING_RUBRICS,
        skill_type="Writing",
        question_prompt=request.question_prompt,
    )
    result = await call_scoring_model(gemini_client, prompt)
    return ScoreResponse(
        session_id=request.session_id,
        answer_id=request.answer_id,
        overall_band=result.overall_band,
        rubrics=result.rubrics,
        overall_feedback=result.overall_feedback,
    )
