from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import SpeakingSpeakerSegment  # noqa: E402
from speaking.audio_activity import build_diarization_analysis_from_segments  # noqa: E402


class SpeakingDiarizationTests(unittest.TestCase):
    def test_diarization_summary_tracks_primary_speaker_ratio(self) -> None:
        analysis = build_diarization_analysis_from_segments(
            [
                SpeakingSpeakerSegment(start=0.0, end=2.0, speaker="SPEAKER_00"),
                SpeakingSpeakerSegment(start=2.5, end=3.0, speaker="SPEAKER_01"),
                SpeakingSpeakerSegment(start=3.2, end=5.2, speaker="SPEAKER_00"),
            ],
            model="pyannote/speaker-diarization-community-1",
            exclusive=True,
        )

        self.assertTrue(analysis.is_available)
        self.assertEqual(analysis.speaker_count, 2)
        self.assertEqual(analysis.speaker_turn_count, 3)
        self.assertEqual(analysis.primary_speaker, "SPEAKER_00")
        self.assertAlmostEqual(analysis.primary_speaker_ratio or 0.0, 0.889, places=3)
        self.assertTrue(analysis.exclusive_speaker_diarization)


if __name__ == "__main__":
    unittest.main()
