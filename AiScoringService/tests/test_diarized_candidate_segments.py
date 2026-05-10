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

from build_candidate_segments_from_diarization import (  # noqa: E402
    assign_words_to_speakers,
    build_candidate_turns,
)


class DiarizedCandidateSegmentTests(unittest.TestCase):
    def test_assigns_words_to_overlapping_speaker_segments(self) -> None:
        words = [
            {"word": "Question?", "start": 0.2, "end": 0.8},
            {"word": "Answer", "start": 1.2, "end": 1.8},
        ]
        segments = [
            {"start": 0.0, "end": 1.0, "speaker": "EXAMINER"},
            {"start": 1.0, "end": 2.0, "speaker": "CANDIDATE"},
        ]

        assigned = assign_words_to_speakers(words, segments, max_nearest_gap_seconds=0.2)

        self.assertEqual(assigned[0]["_speaker"], "EXAMINER")
        self.assertEqual(assigned[1]["_speaker"], "CANDIDATE")

    def test_builds_candidate_turn_and_rejects_intro_prompt(self) -> None:
        words = assign_words_to_speakers(
            [
                {"word": "Can", "start": 0.0, "end": 0.1},
                {"word": "you", "start": 0.1, "end": 0.2},
                {"word": "tell", "start": 0.2, "end": 0.3},
                {"word": "me", "start": 0.3, "end": 0.4},
                {"word": "your", "start": 0.4, "end": 0.5},
                {"word": "full", "start": 0.5, "end": 0.6},
                {"word": "name?", "start": 0.6, "end": 0.7},
                {"word": "My", "start": 1.0, "end": 1.2},
                {"word": "name", "start": 1.2, "end": 1.4},
                {"word": "is", "start": 1.4, "end": 1.6},
                {"word": "Joanne.", "start": 1.6, "end": 2.0},
            ],
            [
                {"start": 0.0, "end": 0.8, "speaker": "EXAMINER"},
                {"start": 0.9, "end": 2.2, "speaker": "CANDIDATE"},
            ],
            max_nearest_gap_seconds=0.2,
        )

        turns = build_candidate_turns(
            sample_id="sample",
            words=words,
            candidate_speaker="CANDIDATE",
            min_turn_duration_seconds=0.5,
            min_turn_words=3,
            max_merge_gap_seconds=0.2,
            max_bridge_words=1,
        )

        self.assertEqual(len(turns), 1)
        self.assertEqual(turns[0]["candidate_only"], "false")
        self.assertEqual(turns[0]["review_status"], "rejected_contaminated")
        self.assertIn("intro_or_id_check_prompt", turns[0]["needs_review_reason"])


if __name__ == "__main__":
    unittest.main()
