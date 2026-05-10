from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import SpeakingGrammarAnalysis  # noqa: E402
from speaking.grammar import (  # noqa: E402
    apply_grammar_complexity_metrics,
    build_grammar_complexity_metrics,
    build_grammar_feature_map,
)


class SpeakingGrammarTests(unittest.TestCase):
    def test_complexity_metrics_detect_clause_and_tense_variety(self) -> None:
        transcript = (
            "I used to live in a small city, but I moved because I wanted better work. "
            "If I have enough time, I will visit my old friends and we could talk about our plans."
        )

        metrics = build_grammar_complexity_metrics(transcript, word_count=34)

        self.assertGreater(metrics["complexity_score"], 0.35)
        self.assertGreaterEqual(metrics["subordinate_clause_count"], 2)
        self.assertGreaterEqual(metrics["modal_verb_count"], 2)
        self.assertGreaterEqual(metrics["tense_marker_variety"], 2)

    def test_complexity_metrics_penalize_repeated_simple_starters(self) -> None:
        transcript = "I like music. I like films. I like food. I like sports."

        metrics = build_grammar_complexity_metrics(transcript, word_count=12)

        self.assertGreater(metrics["repeated_starter_ratio"], 0.5)
        self.assertLess(metrics["complexity_score"], 0.25)

    def test_feature_map_exposes_complexity_metrics(self) -> None:
        analysis = SpeakingGrammarAnalysis(engine="disabled")
        apply_grammar_complexity_metrics(
            analysis,
            "Although it was difficult, I tried to explain why I had changed my opinion.",
            word_count=14,
        )

        features = build_grammar_feature_map(analysis)

        self.assertIn("grammar_complexity_score", features)
        self.assertGreater(features["grammar_subordinate_clause_count"], 0)
        self.assertGreaterEqual(features["grammar_tense_marker_variety"], 1)


if __name__ == "__main__":
    unittest.main()
