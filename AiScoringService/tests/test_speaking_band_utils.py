from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from speaking.band_utils import round_band_half  # noqa: E402


class SpeakingBandUtilsTests(unittest.TestCase):
    def test_round_band_half_uses_ielts_half_up_rounding(self) -> None:
        self.assertEqual(round_band_half(6.24), 6.0)
        self.assertEqual(round_band_half(6.25), 6.5)
        self.assertEqual(round_band_half(6.75), 7.0)

    def test_round_band_half_tolerates_float_precision_noise(self) -> None:
        self.assertEqual(round_band_half(6.749999999999999), 7.0)


if __name__ == "__main__":
    unittest.main()
