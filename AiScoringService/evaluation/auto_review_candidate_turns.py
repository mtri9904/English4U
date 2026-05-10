from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import Any


QUESTION_CUE_PATTERN = re.compile(
    r"\b("
    r"can you|could you|would you|do you|did you|"
    r"what (are|is|do|does|did|would|can)|"
    r"why (do|did|would|is|are)|"
    r"how (do|did|would|is|are|often|important|price|much|many)|"
    r"where (do|did|would|is|are)|"
    r"when (do|did|would|is|are)|"
    r"tell me|describe|explain"
    r")\b",
    re.IGNORECASE,
)

EXAMINER_IN_RESPONSE_PATTERN = re.compile(
    r"\b("
    r"now (i'd|i would|i want) (like|to)|"
    r"(i'd|i would|i want) like to ask|"
    r"(i'd|i would|i want) to ask|"
    r"i'?m going to give you a topic|"
    r"one to two minutes|"
    r"pen and paper|"
    r"you ready|"
    r"please start|"
    r"start talking|"
    r"please stop|"
    r"now i want to ask|"
    r"now i'd like to ask|"
    r"questions related to this topic|"
    r"thank you very much"
    r")\b",
    re.IGNORECASE,
)

INTRO_PROMPT_PATTERN = re.compile(
    r"\b(full name|where (are you|you're) from|identification|can i see|could i see|may i see)\b",
    re.IGNORECASE,
)

APPROVED_STATUS = "candidate_only_ok"
REJECTED_STATUS = "rejected_contaminated"
MANUAL_STATUS = "manual_review_needed"


def parse_bool(value: object) -> bool | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"true", "yes", "y", "1", "ok", "approved", "accepted"}:
        return True
    if text in {"false", "no", "n", "0", "reject", "rejected"}:
        return False
    return None


def parse_float(value: object, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def review_row(row: dict[str, Any]) -> tuple[str, bool | None, list[str]]:
    prompt = str(row.get("prompt_guess") or "")
    text = str(row.get("transcript_preview") or "")
    part_number = int(parse_float(row.get("part_number"), 0.0))
    duration = parse_float(row.get("duration_seconds"), 0.0)
    scoring_candidate = parse_bool(row.get("scoring_candidate"))
    reasons: list[str] = []

    if scoring_candidate is False:
        return REJECTED_STATUS, False, ["not_scoring_candidate"]
    if INTRO_PROMPT_PATTERN.search(prompt):
        return REJECTED_STATUS, False, ["intro_or_id_check"]

    examiner_match = EXAMINER_IN_RESPONSE_PATTERN.search(text)
    question_match = QUESTION_CUE_PATTERN.search(text)
    if examiner_match:
        reasons.append(f"examiner_phrase_in_response={examiner_match.group(0)}")
    if question_match and "?" in text:
        reasons.append(f"question_cue_in_response={question_match.group(0)}")

    if part_number == 1 and duration > 55:
        reasons.append(f"part1_long={duration:.1f}s")
    elif part_number == 2 and duration > 155:
        reasons.append(f"part2_long={duration:.1f}s")
    elif part_number == 3 and duration > 125:
        reasons.append(f"part3_long={duration:.1f}s")

    if examiner_match:
        return MANUAL_STATUS, None, reasons
    if question_match and "?" in text:
        return MANUAL_STATUS, None, reasons
    if reasons:
        return MANUAL_STATUS, None, reasons
    return APPROVED_STATUS, True, ["low_risk_candidate_only"]


def read_rows(path: Path) -> tuple[list[dict[str, Any]], list[str]]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = [dict(row) for row in reader]
        fieldnames = list(reader.fieldnames or [])
    return rows, fieldnames


def write_rows(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Auto-review draft Speaking candidate turns.")
    parser.add_argument("--input", default="evaluation/reports/full_transcripts/candidate_turns.full_audio.review.csv")
    parser.add_argument("--output", default="evaluation/reports/full_transcripts/candidate_turns.full_audio.auto_reviewed.csv")
    parser.add_argument("--overwrite-existing", action="store_true")
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    rows, fieldnames = read_rows(input_path)

    for fieldname in ["auto_review_decision", "auto_review_reasons"]:
        if fieldname not in fieldnames:
            fieldnames.append(fieldname)

    counts = {APPROVED_STATUS: 0, REJECTED_STATUS: 0, MANUAL_STATUS: 0}
    for row in rows:
        existing_candidate_only = parse_bool(row.get("candidate_only"))
        existing_status = str(row.get("review_status") or "").strip()
        preserve_existing = (
            not args.overwrite_existing
            and (existing_candidate_only is not None or existing_status in {APPROVED_STATUS, REJECTED_STATUS})
        )
        if preserve_existing:
            decision = existing_status or (APPROVED_STATUS if existing_candidate_only else REJECTED_STATUS)
            candidate_only = existing_candidate_only
            reasons = ["preserved_existing_review"]
        else:
            decision, candidate_only, reasons = review_row(row)

        row["review_status"] = decision
        row["candidate_only"] = "" if candidate_only is None else str(candidate_only).lower()
        row["auto_review_decision"] = decision
        row["auto_review_reasons"] = "; ".join(reasons)
        counts[decision] = counts.get(decision, 0) + 1

    write_rows(output_path, rows, fieldnames)
    print(f"rows={len(rows)}")
    print(f"approved={counts.get(APPROVED_STATUS, 0)}")
    print(f"manual_review_needed={counts.get(MANUAL_STATUS, 0)}")
    print(f"rejected={counts.get(REJECTED_STATUS, 0)}")
    print(f"wrote={output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
