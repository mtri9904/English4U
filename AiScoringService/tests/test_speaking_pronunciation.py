from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import SpeakingPronunciationAnalysis, SpeakingPronunciationIssue  # noqa: E402
from speaking.pronunciation import (  # noqa: E402
    apply_actual_phone_recognition_to_analysis,
    build_expected_phone_classes_for_word,
    phone_sequence_similarity,
    refresh_acoustic_pronunciation_score,
    score_intelligibility_from_features,
    score_phone_timing_issue_ratio,
)


class SpeakingPronunciationTests(unittest.TestCase):
    def test_expected_phone_classes_are_broad_and_stable(self) -> None:
        self.assertEqual(build_expected_phone_classes_for_word("cat"), ["P", "V", "P"])
        self.assertEqual(build_expected_phone_classes_for_word("thing"), ["F", "V", "N", "P"])

    def test_phone_sequence_similarity_accepts_explicit_broad_classes(self) -> None:
        self.assertEqual(phone_sequence_similarity(["P", "V", "P"], ["k", "ae", "t"]), 1.0)

    def test_allosaurus_word_window_updates_metadata_expected_profile(self) -> None:
        analysis = SpeakingPronunciationAnalysis(
            has_word_timing=True,
            issues=[
                SpeakingPronunciationIssue(
                    word="cat",
                    expected_phoneme="syll=1;final=stop",
                    actual_phoneme="asr=0.90;dur=0.30s;risk=none",
                    is_correct=True,
                    confidence=0.9,
                    start=0.0,
                    end=0.5,
                    issue_type="word_timing_reference",
                )
            ],
        )

        apply_actual_phone_recognition_to_analysis(
            analysis,
            [
                {"start": 0.05, "end": 0.15, "phone": "k"},
                {"start": 0.18, "end": 0.30, "phone": "ae"},
                {"start": 0.33, "end": 0.45, "phone": "t"},
            ],
        )

        self.assertTrue(analysis.has_actual_phone_recognition)
        self.assertEqual(analysis.phone_match_score, 1.0)
        self.assertEqual(analysis.issues[0].expected_phoneme, "P V P")
        self.assertTrue(analysis.issues[0].is_correct)

    def test_phone_timing_issue_ratio_becomes_bounded_score(self) -> None:
        self.assertEqual(score_phone_timing_issue_ratio(0.0), 1.0)
        self.assertEqual(score_phone_timing_issue_ratio(0.2), 0.55)
        self.assertEqual(score_phone_timing_issue_ratio(0.8), 0.0)

    def test_acoustic_pronunciation_score_blends_timing_phone_and_prosody(self) -> None:
        analysis = SpeakingPronunciationAnalysis(
            has_phoneme_alignment=True,
            has_pitch_analysis=True,
            has_actual_phone_recognition=True,
            phone_timing_score=0.8,
            phone_match_score=0.7,
            rhythm_score=0.9,
            stress_score=0.8,
            intonation_score=0.7,
            chunking_score=0.9,
        )

        refresh_acoustic_pronunciation_score(analysis)

        self.assertAlmostEqual(analysis.acoustic_pronunciation_score or 0.0, 0.767, places=3)
        self.assertAlmostEqual(analysis.segmental_score or 0.0, 0.752, places=3)
        self.assertAlmostEqual(analysis.prosody_score or 0.0, 0.825, places=3)
        self.assertEqual(
            analysis.acoustic_pronunciation_source,
            "mfa_phone_timing+allosaurus_phone_match+praat_prosody",
        )

    def test_intelligibility_score_penalizes_low_confidence_and_low_speech_ratio(self) -> None:
        score = score_intelligibility_from_features({
            "mean_word_probability": 0.82,
            "low_confidence_ratio": 0.2,
            "speech_ratio": 0.45,
            "avg_no_speech_prob": 0.5,
        })

        self.assertAlmostEqual(score or 0.0, 0.605, places=3)


if __name__ == "__main__":
    unittest.main()
