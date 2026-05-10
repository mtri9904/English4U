from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))
EVALUATION_ROOT = SERVICE_ROOT / "evaluation"
if str(EVALUATION_ROOT) not in sys.path:
    sys.path.insert(0, str(EVALUATION_ROOT))

from audit_speaking_pronunciation import (  # noqa: E402
    build_pronunciation_feature_map,
    pause_stats_from_word_timestamps,
    slice_transcript_words_for_segment,
    transcript_text_from_words,
)


class SpeakingPronunciationAuditTests(unittest.TestCase):
    def test_slices_full_transcript_words_into_relative_segment_timestamps(self) -> None:
        words = [
            {"word": "Before", "start": 9.1, "end": 9.4, "probability": 0.9},
            {"word": "Hello,", "start": 9.8, "end": 10.2, "probability": 0.8},
            {"word": "candidate", "start": 10.5, "end": 11.0, "probability": 0.9},
            {"word": "answer.", "start": 11.5, "end": 12.0, "probability": 0.4},
            {"word": "After", "start": 12.4, "end": 12.8, "probability": 0.9},
        ]

        sliced = slice_transcript_words_for_segment(
            words,
            start_seconds=10.0,
            end_seconds=12.2,
        )

        self.assertEqual([word.word for word in sliced], ["Hello,", "candidate", "answer."])
        self.assertEqual(sliced[0].start, 0.0)
        self.assertEqual(sliced[0].end, 0.2)
        self.assertEqual(sliced[-1].start, 1.5)
        self.assertEqual(sliced[-1].probability, 0.4)
        self.assertEqual(transcript_text_from_words(sliced), "Hello, candidate answer.")

    def test_builds_pronunciation_features_from_segment_words(self) -> None:
        words = slice_transcript_words_for_segment(
            [
                {"word": "Hello", "start": 10.0, "end": 10.2, "probability": 0.8},
                {"word": "candidate", "start": 10.5, "end": 11.0, "probability": 0.9},
                {"word": "answer", "start": 11.5, "end": 12.0, "probability": 0.4},
            ],
            start_seconds=10.0,
            end_seconds=12.2,
        )
        transcript = transcript_text_from_words(words)

        pause_stats = pause_stats_from_word_timestamps(words)
        features = build_pronunciation_feature_map(
            transcript=transcript,
            words=words,
            duration_seconds=2.2,
            part_number=1,
            prompt_type="part1_short_answer",
            avg_no_speech_prob=0.12,
        )

        self.assertEqual(pause_stats.pause_count, 2)
        self.assertEqual(pause_stats.total_pause_seconds, 0.8)
        self.assertEqual(features["word_count"], 3)
        self.assertEqual(features["target_duration_seconds"], 30)
        self.assertAlmostEqual(float(features["mean_word_probability"] or 0.0), 0.7, places=3)
        self.assertAlmostEqual(float(features["low_confidence_ratio"] or 0.0), 0.333, places=3)
        self.assertAlmostEqual(float(features["pause_ratio"] or 0.0), 0.364, places=3)


if __name__ == "__main__":
    unittest.main()
