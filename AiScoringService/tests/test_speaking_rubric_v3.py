from __future__ import annotations

import sys
import unittest
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from speaking.rubric_v3 import (  # noqa: E402
    get_band_cap_rules,
    get_llm_refiner_criteria,
    get_part_guidance_note,
    get_speaking_criteria,
    load_speaking_rubric_v3,
    speaking_refiner_prompt_notes,
)


class SpeakingRubricV3Tests(unittest.TestCase):
    def test_contract_has_expected_criteria(self) -> None:
        self.assertEqual(
            get_speaking_criteria(),
            [
                "Fluency and Coherence",
                "Lexical Resource",
                "Grammatical Range and Accuracy",
                "Pronunciation",
            ],
        )

    def test_single_answer_llm_refiner_excludes_pronunciation(self) -> None:
        refiner_criteria = get_llm_refiner_criteria()
        self.assertEqual(refiner_criteria, get_speaking_criteria()[:3])
        self.assertNotIn("Pronunciation", refiner_criteria)

    def test_each_criterion_has_whole_band_anchors(self) -> None:
        rubric = load_speaking_rubric_v3()
        for criteria_name in get_speaking_criteria():
            anchors = rubric["criteria"][criteria_name]["band_anchors"]
            self.assertTrue({"4", "5", "6", "7", "8", "9"}.issubset(anchors))

    def test_required_band_cap_rules_are_named(self) -> None:
        rule_ids = {rule["id"] for rule in get_band_cap_rules()}
        self.assertTrue(
            {
                "no_ratable_speech",
                "very_short_language_sample",
                "short_language_sample",
                "missing_multiple_parts",
                "missing_pronunciation_evidence",
            }.issubset(rule_ids)
        )

    def test_prompt_notes_include_examiner_contract(self) -> None:
        notes = speaking_refiner_prompt_notes(get_llm_refiner_criteria())
        self.assertIn("Examiner rubric contract", notes)
        self.assertIn("Fluency and Coherence", notes)
        self.assertIn("Lexical Resource", notes)
        self.assertIn("Grammatical Range and Accuracy", notes)

    def test_part_guidance_distinguishes_part_two_long_turn(self) -> None:
        long_turn = get_part_guidance_note(2, "part2_long_turn")
        follow_up = get_part_guidance_note(2, "part2_follow_up")
        self.assertIn("Sustained", long_turn)
        self.assertNotEqual(long_turn, follow_up)


if __name__ == "__main__":
    unittest.main()
