from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from speaking.lexical import analyze_speaking_lexical, build_lexical_feature_map  # noqa: E402


class SpeakingLexicalTests(unittest.TestCase):
    def test_wordfreq_features_mark_advanced_content_words(self) -> None:
        analysis = analyze_speaking_lexical(
            "I enjoy sustainable architecture because it transforms ordinary communities "
            "into resilient neighbourhoods."
        )

        self.assertTrue(analysis.is_available)
        self.assertGreater(analysis.word_count, 8)
        self.assertGreater(analysis.advanced_word_ratio, 0.0)
        self.assertGreaterEqual(analysis.sophistication_score, 0.0)
        self.assertLessEqual(analysis.sophistication_score, 1.0)

    def test_feature_map_exposes_scoring_keys(self) -> None:
        analysis = analyze_speaking_lexical("I like music because it helps me relax after school.")
        features = build_lexical_feature_map(analysis)

        self.assertEqual(features["lexical_engine_available"], 1)
        self.assertIn("lexical_sophistication_score", features)
        self.assertIn("lexical_advanced_word_ratio", features)


if __name__ == "__main__":
    unittest.main()
