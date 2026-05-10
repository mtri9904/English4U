from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import (  # noqa: E402
    RubricScore,
    ScoreSpeakingSessionRequest,
    SpeakingSessionAnswerInput,
    SpeakingSessionRubricInput,
    StructuredSpeakingSessionResult,
)
from speaking.session_scoring import (  # noqa: E402
    build_speaking_session_deterministic_result,
    merge_speaking_session_result,
)


CRITERIA = (
    "Fluency and Coherence",
    "Lexical Resource",
    "Grammatical Range and Accuracy",
    "Pronunciation",
)

VOCABULARY = (
    "education",
    "technology",
    "community",
    "experience",
    "development",
    "opportunity",
    "challenge",
    "environment",
    "conversation",
    "confidence",
)


def make_transcript(word_count: int) -> str:
    return " ".join(VOCABULARY[index % len(VOCABULARY)] for index in range(word_count))


def make_input_rubrics(band: float) -> list[SpeakingSessionRubricInput]:
    return [
        SpeakingSessionRubricInput(criteria=criteria, band=band)
        for criteria in CRITERIA
    ]


def make_output_rubrics(band: float) -> list[RubricScore]:
    return [
        RubricScore(
            criteria=criteria,
            band=band,
            comment="comment",
            improvements="improvements",
        )
        for criteria in CRITERIA
    ]


class SpeakingSessionScoringTests(unittest.TestCase):
    def test_complete_full_session_lifts_language_anchors(self) -> None:
        request = ScoreSpeakingSessionRequest(
            session_id="session-full",
            answers=[
                SpeakingSessionAnswerInput(
                    answer_id="p1",
                    part_number=1,
                    transcript_text=make_transcript(220),
                    rubrics=make_input_rubrics(6.0),
                ),
                SpeakingSessionAnswerInput(
                    answer_id="p2",
                    part_number=2,
                    transcript_text=make_transcript(320),
                    rubrics=make_input_rubrics(6.0),
                ),
                SpeakingSessionAnswerInput(
                    answer_id="p3",
                    part_number=3,
                    transcript_text=make_transcript(260),
                    rubrics=make_input_rubrics(6.0),
                ),
            ],
        )

        rubrics, _feedback, metrics = build_speaking_session_deterministic_result(request)
        bands = {rubric.criteria: rubric.band for rubric in rubrics}

        self.assertEqual(metrics["complete_session_coverage"], "yes")
        self.assertEqual(metrics["session_refiner_max_adjustment"], 1.5)
        self.assertEqual(bands["Fluency and Coherence"], 7.0)
        self.assertEqual(bands["Lexical Resource"], 7.0)
        self.assertEqual(bands["Grammatical Range and Accuracy"], 7.0)
        self.assertEqual(bands["Pronunciation"], 6.5)

    def test_incomplete_session_keeps_original_guardrails(self) -> None:
        request = ScoreSpeakingSessionRequest(
            session_id="session-part-one-only",
            answers=[
                SpeakingSessionAnswerInput(
                    answer_id="p1",
                    part_number=1,
                    transcript_text=make_transcript(300),
                    rubrics=make_input_rubrics(6.0),
                )
            ],
        )

        rubrics, _feedback, metrics = build_speaking_session_deterministic_result(request)
        bands = {rubric.criteria: rubric.band for rubric in rubrics}

        self.assertEqual(metrics["complete_session_coverage"], "no")
        self.assertEqual(metrics["session_refiner_max_adjustment"], 0.5)
        self.assertTrue(all(band == 6.0 for band in bands.values()))

    def test_complete_session_allows_wider_gemini_refinement(self) -> None:
        deterministic_rubrics = make_output_rubrics(7.0)
        gemini_result = StructuredSpeakingSessionResult(
            overall_band=9.0,
            overall_feedback="feedback",
            rubrics=make_output_rubrics(9.0),
        )
        metrics = {
            "total_answers": 3,
            "ratable_answers": 3,
            "no_response_answers": 0,
            "total_word_count": 800,
            "no_response_ratio": 0.0,
            "ratable_parts": "1,2,3",
            "configured_parts": "1,2,3",
            "complete_session_coverage": "yes",
            "session_refiner_max_adjustment": 1.5,
        }

        merged, feedback = merge_speaking_session_result(
            deterministic_rubrics,
            "fallback",
            gemini_result,
            metrics,
        )
        bands = {rubric.criteria: rubric.band for rubric in merged}

        self.assertEqual(feedback, "feedback")
        self.assertTrue(all(band == 8.5 for band in bands.values()))


if __name__ == "__main__":
    unittest.main()
