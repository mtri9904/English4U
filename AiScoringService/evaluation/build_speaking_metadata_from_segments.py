from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from speaking_eval_common import load_jsonl, validate_metadata_row


APPROVED_REVIEW_STATUSES = {
    "reviewed",
    "approved",
    "candidate_only_ok",
    "accepted",
}


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as ex:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {ex}") from ex
            if not isinstance(row, dict):
                raise ValueError(f"{path}:{line_number}: row must be an object.")
            rows.append(row)
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            clean_row = {key: value for key, value in row.items() if not key.startswith("_")}
            handle.write(json.dumps(clean_row, ensure_ascii=False, separators=(",", ":")) + "\n")


def normalise_segment(segment: dict[str, Any]) -> dict[str, Any]:
    clean = {
        "part_number": int(segment["part_number"]),
        "prompt_type": segment.get("prompt_type"),
        "prompt": segment.get("prompt"),
        "start_seconds": round(float(segment["start_seconds"]), 2),
        "end_seconds": round(float(segment["end_seconds"]), 2),
    }
    return clean


def load_segments_by_sample(path: Path, *, allow_draft: bool) -> dict[str, list[dict[str, Any]]]:
    segments_by_sample: dict[str, list[dict[str, Any]]] = {}
    for row in read_jsonl(path):
        sample_id = row.get("sample_id")
        proposed_segments = row.get("proposed_candidate_segments")
        if not isinstance(sample_id, str) or not isinstance(proposed_segments, list):
            continue
        clean_segments = []
        for segment in proposed_segments:
            if not isinstance(segment, dict):
                continue
            review_status = str(segment.get("review_status") or "")
            if not allow_draft and review_status not in APPROVED_REVIEW_STATUSES:
                continue
            try:
                clean_segments.append(normalise_segment(segment))
            except (KeyError, TypeError, ValueError):
                continue
        if clean_segments:
            segments_by_sample[sample_id] = clean_segments
    return segments_by_sample


def parse_bool(value: object) -> bool | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"true", "yes", "y", "1", "ok", "approved", "accepted"}:
        return True
    if text in {"false", "no", "n", "0", "reject", "rejected"}:
        return False
    return None


def parse_seconds(primary: object, fallback: object) -> float:
    text = str(primary or "").strip()
    if text:
        return float(text)
    return float(fallback)


def load_segments_from_review_csv(path: Path, *, allow_draft: bool) -> dict[str, list[dict[str, Any]]]:
    segments_by_sample: dict[str, list[dict[str, Any]]] = {}
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            sample_id = str(row.get("sample_id") or "").strip()
            if not sample_id:
                continue
            scoring_candidate = parse_bool(row.get("scoring_candidate"))
            candidate_only = parse_bool(row.get("candidate_only"))
            review_status = str(row.get("review_status") or "").strip()

            if candidate_only is False:
                continue
            if not allow_draft:
                approved = candidate_only is True or review_status in APPROVED_REVIEW_STATUSES
                if not approved:
                    continue
            elif scoring_candidate is False:
                continue

            try:
                segment = {
                    "part_number": int(row["part_number"]),
                    "prompt_type": row.get("prompt_type") or None,
                    "prompt": row.get("prompt_guess") or None,
                    "start_seconds": round(parse_seconds(row.get("corrected_start_seconds"), row["start_seconds"]), 2),
                    "end_seconds": round(parse_seconds(row.get("corrected_end_seconds"), row["end_seconds"]), 2),
                }
            except (KeyError, TypeError, ValueError):
                continue
            if segment["end_seconds"] <= segment["start_seconds"]:
                continue
            segments_by_sample.setdefault(sample_id, []).append(segment)

    for sample_id, segments in segments_by_sample.items():
        segments.sort(key=lambda item: (int(item["part_number"]), float(item["start_seconds"])))
    return segments_by_sample


def build_rows(
    rows: list[dict[str, Any]],
    segments_by_sample: dict[str, list[dict[str, Any]]],
    *,
    note_suffix: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    output_rows: list[dict[str, Any]] = []
    updated_sample_ids: list[str] = []
    for row in rows:
        sample_id = str(row.get("sample_id") or "")
        clean_row = {key: value for key, value in row.items() if not key.startswith("_")}
        if sample_id in segments_by_sample:
            clean_row["candidate_segments"] = segments_by_sample[sample_id]
            notes = str(clean_row.get("notes") or "").strip()
            clean_row["notes"] = f"{notes} {note_suffix}".strip()
            updated_sample_ids.append(sample_id)
        output_rows.append(clean_row)
    return output_rows, updated_sample_ids


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Speaking metadata JSONL from reviewed/proposed candidate segments.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--segments", default="evaluation/reports/full_transcripts/candidate_segments.scoring.proposed.jsonl")
    parser.add_argument("--review-csv", default=None)
    parser.add_argument("--output", default="evaluation/reports/full_transcripts/youtube_silver_samples.scoring_segments.draft.jsonl")
    parser.add_argument("--allow-draft", action="store_true", help="Allow draft_needs_human_review segments.")
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    segments_path = (service_root / args.segments) if not Path(args.segments).is_absolute() else Path(args.segments)
    review_csv_path = (
        (service_root / args.review_csv) if args.review_csv and not Path(args.review_csv).is_absolute() else Path(args.review_csv)
    ) if args.review_csv else None
    output_path = (service_root / args.output) if not Path(args.output).is_absolute() else Path(args.output)

    rows = load_jsonl(metadata_path)
    metadata_errors = [error for row in rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    if review_csv_path is not None:
        segments_by_sample = load_segments_from_review_csv(review_csv_path, allow_draft=args.allow_draft)
    else:
        segments_by_sample = load_segments_by_sample(segments_path, allow_draft=args.allow_draft)
    note_suffix = (
        "Candidate segments were generated from full-audio ASR draft and still require human review."
        if args.allow_draft
        else "Candidate segments were copied from reviewed candidate-only segment proposals."
    )
    output_rows, updated_sample_ids = build_rows(rows, segments_by_sample, note_suffix=note_suffix)
    output_errors = [error for row in output_rows for error in validate_metadata_row(row)]
    if output_errors:
        for error in output_errors:
            print(f"ERROR: {error}")
        return 1

    write_jsonl(output_path, output_rows)
    print(f"updated_samples={len(updated_sample_ids)}")
    for sample_id in updated_sample_ids:
        print(f"UPDATED {sample_id}: segments={len(segments_by_sample[sample_id])}")
    print(f"wrote_metadata={output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
