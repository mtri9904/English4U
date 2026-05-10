from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


RUBRIC_FILE = Path(__file__).with_name("rubric_v3.json")


class SpeakingRubricError(RuntimeError):
    """Raised when the speaking rubric contract is invalid."""


@lru_cache(maxsize=1)
def load_speaking_rubric_v3() -> dict[str, Any]:
    with RUBRIC_FILE.open("r", encoding="utf-8") as handle:
        rubric = json.load(handle)
    validate_speaking_rubric_v3(rubric)
    return rubric


def validate_speaking_rubric_v3(rubric: dict[str, Any]) -> None:
    if rubric.get("schema_version") != "speaking-rubric-v3.0":
        raise SpeakingRubricError("Unexpected speaking rubric schema_version.")

    criteria_order = rubric.get("criteria_order")
    criteria = rubric.get("criteria")
    if not isinstance(criteria_order, list) or not criteria_order:
        raise SpeakingRubricError("Speaking rubric requires a non-empty criteria_order.")
    if not isinstance(criteria, dict):
        raise SpeakingRubricError("Speaking rubric requires a criteria object.")

    missing = [name for name in criteria_order if name not in criteria]
    if missing:
        raise SpeakingRubricError(f"Speaking rubric criteria are missing: {', '.join(missing)}")

    for name in criteria_order:
        item = criteria[name]
        anchors = item.get("band_anchors") if isinstance(item, dict) else None
        if not isinstance(anchors, dict):
            raise SpeakingRubricError(f"Criterion {name} requires band_anchors.")
        required_whole_bands = {"4", "5", "6", "7", "8", "9"}
        missing_bands = sorted(required_whole_bands - set(anchors))
        if missing_bands:
            raise SpeakingRubricError(
                f"Criterion {name} is missing band anchors: {', '.join(missing_bands)}"
            )

    refiner_criteria = rubric.get("llm_refiner_criteria")
    if not isinstance(refiner_criteria, list) or not refiner_criteria:
        raise SpeakingRubricError("Speaking rubric requires llm_refiner_criteria.")
    invalid_refiners = [name for name in refiner_criteria if name not in criteria_order]
    if invalid_refiners:
        raise SpeakingRubricError(
            f"Invalid llm_refiner_criteria: {', '.join(invalid_refiners)}"
        )

    band_cap_rules = rubric.get("band_cap_rules")
    if not isinstance(band_cap_rules, list) or not band_cap_rules:
        raise SpeakingRubricError("Speaking rubric requires band_cap_rules.")


def get_speaking_criteria() -> list[str]:
    return list(load_speaking_rubric_v3()["criteria_order"])


def get_llm_refiner_criteria() -> list[str]:
    return list(load_speaking_rubric_v3()["llm_refiner_criteria"])


def get_band_cap_rules() -> list[dict[str, Any]]:
    return list(load_speaking_rubric_v3()["band_cap_rules"])


def get_part_guidance_note(part_number: int | None, prompt_type: str | None = None) -> str:
    expectations = load_speaking_rubric_v3()["part_expectations"]
    normalized_prompt_type = (prompt_type or "").strip().lower()
    if part_number == 2 and normalized_prompt_type in {"part2_long_turn", "cue_card", "long_turn"}:
        key = "2_long_turn"
    elif part_number == 2:
        key = "2_follow_up"
    elif part_number == 1:
        key = "1"
    elif part_number == 3:
        key = "3"
    else:
        return "Use the response as part of a full IELTS-style Speaking interview."

    item = expectations.get(key, {})
    return str(item.get("examiner_expectation") or "Use part-appropriate IELTS Speaking expectations.")


def speaking_refiner_prompt_notes(criteria_names: list[str] | tuple[str, ...] | None = None) -> str:
    rubric = load_speaking_rubric_v3()
    criteria = rubric["criteria"]
    selected_names = list(criteria_names or rubric["criteria_order"])

    blocks: list[str] = []
    for name in selected_names:
        item = criteria[name]
        focus = "; ".join(item.get("examiner_focus", [])[:5])
        positives = "; ".join(item.get("positive_evidence", [])[:3])
        negatives = "; ".join(item.get("negative_evidence", [])[:3])
        blocks.append(
            f"- {name}: focus on {focus}. Positive evidence: {positives}. Red flags: {negatives}."
        )

    principles = "\n".join(f"- {item}" for item in rubric.get("global_examiner_principles", [])[:6])
    refiner_rules = "\n".join(f"- {item}" for item in rubric.get("llm_refiner_rules", [])[:7])
    return (
        "Examiner rubric contract:\n"
        f"{principles}\n\n"
        "Criterion guidance:\n"
        f"{chr(10).join(blocks)}\n\n"
        "Refiner rules:\n"
        f"{refiner_rules}"
    )

