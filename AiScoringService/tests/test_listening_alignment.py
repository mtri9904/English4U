from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from listening.alignment import (  # noqa: E402
    detect_question_range_scopes,
    extract_alignment_tokens,
    extract_section_number_from_text,
    split_listening_transcript_into_parts,
)
from listening.local_alignment import (  # noqa: E402
    build_alignment_candidate_windows,
    select_fallback_alignment_candidate,
)
from schemas import ListeningAlignmentQuestion, ListeningTranscriptSegment  # noqa: E402


class ListeningAlignmentTests(unittest.TestCase):
    def test_extract_section_number_accepts_words_and_digits(self) -> None:
        self.assertEqual(extract_section_number_from_text("Now turn to Section Three."), 3)
        self.assertEqual(extract_section_number_from_text("Turn to section 4."), 4)
        self.assertIsNone(extract_section_number_from_text("Section five is not an IELTS Listening part."))

    def test_detect_question_range_scope_starts_after_instruction_segment(self) -> None:
        segments = [
            ListeningTranscriptSegment(start_time=0, text="Questions 11 to 14"),
            ListeningTranscriptSegment(start_time=1, text="The answer evidence starts here."),
            ListeningTranscriptSegment(start_time=2, text="Questions 15 to 20"),
            ListeningTranscriptSegment(start_time=3, text="More evidence."),
        ]

        scopes = detect_question_range_scopes(segments)

        self.assertEqual(scopes[0]["start_question"], 11)
        self.assertEqual(scopes[0]["start_segment_index"], 1)
        self.assertEqual(scopes[0]["end_segment_index"], 1)
        self.assertEqual(scopes[1]["start_question"], 15)
        self.assertEqual(scopes[1]["start_segment_index"], 3)

    def test_split_transcript_into_four_parts_from_transition_markers(self) -> None:
        segments = [
            ListeningTranscriptSegment(start_time=0, text="Section one evidence."),
            ListeningTranscriptSegment(start_time=10, text="Now turn to section two."),
            ListeningTranscriptSegment(start_time=20, text="Section two evidence."),
            ListeningTranscriptSegment(start_time=30, text="Now turn to section three."),
            ListeningTranscriptSegment(start_time=40, text="Section three evidence."),
            ListeningTranscriptSegment(start_time=50, text="Now turn to section four."),
            ListeningTranscriptSegment(start_time=60, text="Section four evidence."),
        ]

        parts = split_listening_transcript_into_parts(segments)

        self.assertEqual([part["global_start_index"] for part in parts], [0, 1, 3, 5])
        self.assertEqual([len(part["segments"]) for part in parts], [1, 2, 2, 2])

    def test_split_transcript_handles_transition_marker_split_across_segments(self) -> None:
        segments = [
            ListeningTranscriptSegment(start_time=0, text="Section one evidence."),
            ListeningTranscriptSegment(start_time=10, text="Now turn to section two."),
            ListeningTranscriptSegment(start_time=20, text="Section two evidence."),
            ListeningTranscriptSegment(start_time=30, text="Now turn to section three."),
            ListeningTranscriptSegment(
                start_time=40,
                text="That is the end of section three. You now have half a minute. Now turn to section",
            ),
            ListeningTranscriptSegment(
                start_time=50,
                text="four. Recording 66. You will hear part of a lecture.",
            ),
            ListeningTranscriptSegment(start_time=60, text="Questions 31 to 40."),
        ]

        parts = split_listening_transcript_into_parts(segments)

        self.assertEqual([part["global_start_index"] for part in parts], [0, 1, 3, 5])

    def test_extract_alignment_tokens_adds_simple_stem_variants(self) -> None:
        tokens = extract_alignment_tokens("planning workshops")

        self.assertIn("planning", tokens)
        self.assertIn("plann", tokens)
        self.assertIn("workshop", tokens)

    def test_local_candidate_scoring_prefers_direct_answer_segment(self) -> None:
        segments = [
            ListeningTranscriptSegment(start_time=0, end_time=5, text="First, look at the map."),
            ListeningTranscriptSegment(start_time=5, end_time=10, text="Cross the bridge to reach the picnic area."),
        ]
        question = ListeningAlignmentQuestion(
            question_number=16,
            question_text="Where should visitors cross?",
            correct_answer="bridge",
            group_type="SHORT_ANSWER",
        )

        candidates = build_alignment_candidate_windows(segments, question)
        fallback_candidate, confidence = select_fallback_alignment_candidate(
            candidates,
            requires_direct_evidence=True,
        )

        self.assertIsNotNone(fallback_candidate)
        self.assertEqual(fallback_candidate["segment_indexes"], [1])
        self.assertIn(confidence, {"medium", "high"})


if __name__ == "__main__":
    unittest.main()
