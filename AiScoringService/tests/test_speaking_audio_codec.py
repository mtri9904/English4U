from __future__ import annotations

import os
import sys
import unittest
import wave
from pathlib import Path
from unittest.mock import patch


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from speaking.audio_codec import (  # noqa: E402
    is_wav_file_path,
    normalize_audio_to_16khz_mono_wav,
    read_wav_pcm_samples,
)


class SpeakingAudioCodecTests(unittest.TestCase):
    def test_pyav_fallback_writes_wav_when_ffmpeg_is_missing(self) -> None:
        output_path = None
        with patch("speaking.audio_codec.shutil.which", return_value=None), patch(
            "speaking.audio_codec.decode_audio_samples_with_pyav",
            return_value=([0.0, 0.25, -0.25, 0.5], 16000, 1, 0.00025, "pyav/pcm/16kHz/mono"),
        ):
            analysis_path, cleanup_path, warning = normalize_audio_to_16khz_mono_wav("input.webm")
            output_path = cleanup_path

            self.assertTrue(is_wav_file_path(analysis_path))
            self.assertEqual(analysis_path, cleanup_path)
            self.assertIn("PyAV", warning or "")
            with wave.open(analysis_path, "rb") as wav_file:
                self.assertEqual(wav_file.getnchannels(), 1)
                self.assertEqual(wav_file.getframerate(), 16000)
                self.assertEqual(wav_file.getsampwidth(), 2)
                self.assertEqual(wav_file.getnframes(), 4)

            samples, sample_rate, channels, duration_seconds = read_wav_pcm_samples(analysis_path)
            self.assertEqual(sample_rate, 16000)
            self.assertEqual(channels, 1)
            self.assertGreater(duration_seconds, 0.0)
            self.assertEqual(len(samples), 4)
        if output_path and os.path.exists(output_path):
            os.unlink(output_path)

    def test_failed_normalization_keeps_non_wav_path_with_warning(self) -> None:
        with patch("speaking.audio_codec.shutil.which", return_value=None), patch(
            "speaking.audio_codec.decode_audio_samples_with_pyav",
            side_effect=RuntimeError("decode failed"),
        ):
            analysis_path, cleanup_path, warning = normalize_audio_to_16khz_mono_wav("input.webm")

        self.assertEqual(analysis_path, "input.webm")
        self.assertIsNone(cleanup_path)
        self.assertFalse(is_wav_file_path(analysis_path))
        self.assertIn("Could not normalize audio", warning or "")


if __name__ == "__main__":
    unittest.main()
