from __future__ import annotations

import json
from pathlib import Path
from typing import Any


SPEAKING_CRITERIA = [
    "Fluency and Coherence",
    "Lexical Resource",
    "Grammatical Range and Accuracy",
    "Pronunciation",
]

VALID_DATASET_LEVELS = {"bronze", "silver", "gold_candidate", "gold"}
VALID_LABEL_QUALITIES = {
    "unknown",
    "youtube_claimed_band",
    "teacher_feedback",
    "examiner_style_report",
    "project_teacher_review",
    "official_examiner_score",
}
VALID_SOURCE_TYPES = {"youtube", "webpage_with_embedded_video", "local_audio", "other"}


def load_jsonl(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as ex:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {ex}") from ex
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: each JSONL row must be an object.")
            row["_line_number"] = line_number
            rows.append(row)
    return rows


def is_half_band(value: object) -> bool:
    return isinstance(value, (int, float)) and 0 <= float(value) <= 9 and float(value) * 2 == int(float(value) * 2)


def validate_metadata_row(row: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    line = row.get("_line_number", "?")
    prefix = f"line {line}, sample {row.get('sample_id', '<missing>')}: "

    sample_id = row.get("sample_id")
    if not isinstance(sample_id, str) or not sample_id.strip():
        errors.append(prefix + "sample_id is required.")

    if row.get("source_type") not in VALID_SOURCE_TYPES:
        errors.append(prefix + f"source_type must be one of {sorted(VALID_SOURCE_TYPES)}.")

    if row.get("dataset_level") not in VALID_DATASET_LEVELS:
        errors.append(prefix + f"dataset_level must be one of {sorted(VALID_DATASET_LEVELS)}.")

    if row.get("label_quality") not in VALID_LABEL_QUALITIES:
        errors.append(prefix + f"label_quality must be one of {sorted(VALID_LABEL_QUALITIES)}.")

    source_page_url = row.get("source_page_url")
    if not isinstance(source_page_url, str) or not source_page_url.startswith(("http://", "https://")):
        errors.append(prefix + "source_page_url must be an http(s) URL.")

    claimed_overall = row.get("claimed_overall_band")
    if claimed_overall is not None and not is_half_band(claimed_overall):
        errors.append(prefix + "claimed_overall_band must be null or a 0.5-step band from 0 to 9.")

    has_breakdown = row.get("has_criterion_breakdown")
    if not isinstance(has_breakdown, bool):
        errors.append(prefix + "has_criterion_breakdown must be boolean.")

    criterion_scores = row.get("claimed_criterion_scores")
    if criterion_scores is not None:
        if not isinstance(criterion_scores, dict):
            errors.append(prefix + "claimed_criterion_scores must be null or an object.")
        else:
            missing = [criteria for criteria in SPEAKING_CRITERIA if criteria not in criterion_scores]
            if missing:
                errors.append(prefix + f"claimed_criterion_scores missing: {', '.join(missing)}.")
            for criteria, value in criterion_scores.items():
                if criteria not in SPEAKING_CRITERIA:
                    errors.append(prefix + f"unknown criterion score: {criteria}.")
                elif not is_half_band(value):
                    errors.append(prefix + f"{criteria} must be a 0.5-step band from 0 to 9.")

    if has_breakdown and row.get("dataset_level") in {"gold_candidate", "gold"}:
        if criterion_scores is None:
            errors.append(prefix + "gold_candidate/gold with has_criterion_breakdown=true should include claimed_criterion_scores when known.")

    segments = row.get("candidate_segments")
    if segments is None:
        return errors
    if not isinstance(segments, list):
        errors.append(prefix + "candidate_segments must be an array.")
        return errors
    for index, segment in enumerate(segments):
        if not isinstance(segment, dict):
            errors.append(prefix + f"candidate_segments[{index}] must be an object.")
            continue
        start = segment.get("start_seconds")
        end = segment.get("end_seconds")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            errors.append(prefix + f"candidate_segments[{index}] requires numeric start_seconds/end_seconds.")
        elif end <= start:
            errors.append(prefix + f"candidate_segments[{index}] end_seconds must be greater than start_seconds.")
        part = segment.get("part_number")
        if part not in {1, 2, 3}:
            errors.append(prefix + f"candidate_segments[{index}] part_number must be 1, 2, or 3.")

    return errors


def round_half(value: float) -> float:
    return round(max(0.0, min(9.0, value)) * 2) / 2


def overall_from_criteria(scores: dict[str, float]) -> float:
    return round_half(sum(float(scores[criteria]) for criteria in SPEAKING_CRITERIA) / len(SPEAKING_CRITERIA))

