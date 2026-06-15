from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any

from speaking_eval_common import load_jsonl, validate_metadata_row


EXAMINER_CUE_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"\b(i'd|i would) like (now )?to (ask|talk|move|begin)\b",
        r"\b(now|right|okay),? (i'd|i would) like\b",
        r"\b(can|could|would) you\b",
        r"\b(do|did) you\b",
        r"\bwhat (are|is|do|does|did|would|can)\b",
        r"\bwhy (do|did|would|is|are)\b",
        r"\bhow (do|did|would|is|are|often|important|much|many)\b",
        r"\bwhere (do|did|would|is|are)\b",
        r"\bwhen (do|did|would|is|are)\b",
        r"\btell me\b",
        r"\bdescribe\b",
        r"\bexplain\b",
        r"\blet'?s talk about\b",
        r"\bthank you\b",
    ]
]

EXAMINER_START_PHRASES = [
    ("okay", "do"),
    ("okay", "did"),
    ("okay", "what"),
    ("okay", "why"),
    ("okay", "how"),
    ("okay", "where"),
    ("okay", "when"),
    ("okay", "right"),
    ("okay", "and", "can", "i"),
    ("okay", "can", "i"),
    ("right", "now", "i'm", "going"),
    ("right", "now", "i", "am", "going"),
    ("right", "i'd", "like", "to", "ask"),
    ("right", "i'd", "like", "now", "to", "ask"),
    ("right", "i", "would", "like", "to", "ask"),
    ("right", "i", "would", "like", "now", "to", "ask"),
    ("now", "i'd", "like", "to", "ask"),
    ("now", "i'd", "like", "to", "talk"),
    ("now", "i", "would", "like", "to", "ask"),
    ("now", "i", "would", "like", "to", "talk"),
    ("and", "do", "you"),
    ("and", "did", "you"),
    ("and", "what"),
    ("and", "why"),
    ("and", "how"),
    ("and", "where"),
    ("and", "when"),
    ("and", "can", "i"),
    ("and", "could", "i"),
    ("and", "may", "i"),
    ("i'd", "like", "to", "ask"),
    ("i'd", "like", "now", "to", "ask"),
    ("i'd", "like", "to", "talk"),
    ("i", "would", "like", "to", "ask"),
    ("i", "would", "like", "now", "to", "ask"),
    ("i", "would", "like", "to", "talk"),
    ("do", "you"),
    ("did", "you"),
    ("can", "i"),
    ("can", "you"),
    ("could", "i"),
    ("could", "you"),
    ("may", "i"),
    ("would", "you"),
    ("what", "are"),
    ("what", "is"),
    ("what", "do"),
    ("what", "does"),
    ("what", "did"),
    ("why", "do"),
    ("why", "did"),
    ("how", "do"),
    ("how", "did"),
    ("how", "often"),
    ("how", "price"),
    ("how", "important"),
    ("how", "much"),
    ("how", "many"),
    ("where", "do"),
    ("when", "do"),
    ("tell", "me"),
    ("let's", "talk"),
    ("thank", "you"),
]

PART_DURATION_LIMITS = {
    1: 180.0,
    2: 170.0,
    3: 360.0,
}


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def resolve_project_path(service_root: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.is_absolute() else service_root / path


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
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
            if isinstance(row, dict):
                rows.append(row)
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text))


def compact_text(text: str, limit: int = 220) -> str:
    cleaned = " ".join(text.split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 3].rstrip() + "..."


def cue_hits(text: str) -> list[str]:
    hits: list[str] = []
    for pattern in EXAMINER_CUE_PATTERNS:
        if pattern.search(text):
            hits.append(pattern.pattern)
    return hits


def risk_level(duration_seconds: float, part_number: int | None, transcript_text: str) -> tuple[str, list[str]]:
    hits = cue_hits(transcript_text)
    question_marks = transcript_text.count("?")
    reasons: list[str] = []
    if hits:
        reasons.append(f"examiner_cues={len(hits)}")
    if question_marks:
        reasons.append(f"question_marks={question_marks}")
    if part_number in PART_DURATION_LIMITS and duration_seconds > PART_DURATION_LIMITS[part_number]:
        reasons.append(f"long_for_part={duration_seconds:.1f}s")
    if not transcript_text:
        reasons.append("no_transcript")

    if question_marks >= 3 or len(hits) >= 4:
        return "high", reasons
    if question_marks >= 1 or len(hits) >= 2 or any(item.startswith("long_for_part=") for item in reasons):
        return "medium", reasons
    if not transcript_text:
        return "unknown", reasons
    return "low", reasons


def normalise_token(raw_word: str) -> str:
    token = raw_word.strip().lower()
    token = re.sub(r"^[^a-z']+|[^a-z']+$", "", token)
    return token


def starts_with_phrase(tokens: list[str], index: int, phrase: tuple[str, ...]) -> bool:
    if index + len(phrase) > len(tokens):
        return False
    return tuple(tokens[index : index + len(phrase)]) == phrase


def is_examiner_start(tokens: list[str], index: int) -> bool:
    return any(starts_with_phrase(tokens, index, phrase) for phrase in EXAMINER_START_PHRASES)


def words_to_text(words: list[dict[str, Any]], start_index: int, end_index: int) -> str:
    return " ".join(str(word.get("word", "")).strip() for word in words[start_index : end_index + 1]).strip()


def draft_candidate_turns(
    *,
    sample_id: str,
    segment_index: int,
    segment: dict[str, Any],
    score_result: dict[str, Any],
    min_turn_duration_seconds: float,
) -> list[dict[str, Any]]:
    words = score_result.get("speaking_evidence", {}).get("word_timestamps")
    if not isinstance(words, list) or not words:
        words = score_result.get("word_timestamps")
    if not isinstance(words, list) or not words:
        return []

    tokens = [normalise_token(str(word.get("word", ""))) for word in words]
    segment_start = float(segment.get("start_seconds", 0.0))
    part_number = int(segment.get("part_number", 0) or 0)
    prompt_type = segment.get("prompt_type")

    state = "examiner"
    prompt_start_index = 0
    candidate_start_index: int | None = None
    last_prompt = str(segment.get("prompt") or "")
    turns: list[dict[str, Any]] = []

    def close_candidate(end_index: int, reason: str) -> None:
        nonlocal candidate_start_index
        if candidate_start_index is None or end_index < candidate_start_index:
            candidate_start_index = None
            return

        while end_index >= candidate_start_index and tokens[end_index] in {"okay", "right"}:
            end_index -= 1
        if (
            end_index - 1 >= candidate_start_index
            and tokens[end_index] == "good"
            and tokens[end_index - 1] == "okay"
        ):
            end_index -= 2
        if end_index < candidate_start_index:
            candidate_start_index = None
            return

        start_word = words[candidate_start_index]
        end_word = words[end_index]
        local_start = float(start_word.get("start", 0.0))
        local_end = float(end_word.get("end", end_word.get("start", 0.0)))
        duration = local_end - local_start
        text = words_to_text(words, candidate_start_index, end_index)
        if duration >= min_turn_duration_seconds and count_words(text) >= 3:
            turns.append(
                {
                    "sample_id": sample_id,
                    "source_segment_index": segment_index,
                    "turn_index": len(turns) + 1,
                    "part_number": part_number,
                    "prompt_type": prompt_type,
                    "prompt_guess": compact_text(last_prompt, 180) if last_prompt else None,
                    "start_seconds": round(segment_start + local_start, 2),
                    "end_seconds": round(segment_start + local_end, 2),
                    "duration_seconds": round(duration, 2),
                    "word_count": count_words(text),
                    "transcript_preview": compact_text(text, 240),
                    "review_status": "draft",
                    "needs_review_reason": reason,
                }
            )
        candidate_start_index = None

    for index, word in enumerate(words):
        raw_word = str(word.get("word", ""))
        if state == "examiner":
            if "?" in raw_word:
                last_prompt = words_to_text(words, prompt_start_index, index)
                state = "candidate"
                candidate_start_index = index + 1
            continue

        if state == "candidate" and is_examiner_start(tokens, index):
            close_candidate(index - 1, "next_examiner_cue")
            state = "examiner"
            prompt_start_index = index
            if "?" in raw_word:
                last_prompt = words_to_text(words, prompt_start_index, index)
                state = "candidate"
                candidate_start_index = index + 1

    if state == "candidate" and candidate_start_index is not None:
        close_candidate(len(words) - 1, "end_of_segment")

    return turns


def load_details_by_sample(details_path: Path | None) -> dict[str, dict[str, Any]]:
    if details_path is None:
        return {}
    return {str(row.get("sample_id")): row for row in read_jsonl(details_path) if row.get("sample_id")}


def segment_output_path(service_root: Path, sample_id: str, segment_index: int, part_number: int) -> Path:
    return (
        service_root
        / "evaluation"
        / "segments"
        / sample_id
        / f"{sample_id}_part{part_number}_{segment_index:02d}.wav"
    )


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_markdown_report(
    path: Path,
    *,
    summary: dict[str, Any],
    audit_rows: list[dict[str, Any]],
    missing_rows: list[dict[str, Any]],
    candidate_turns: list[dict[str, Any]],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    high_risk = [row for row in audit_rows if row.get("risk_level") == "high"]
    medium_risk = [row for row in audit_rows if row.get("risk_level") == "medium"]
    lines = [
        "# Speaking segment audit",
        "",
        "## Summary",
        "",
        f"- samples_total: {summary['samples_total']}",
        f"- audio_available: {summary['audio_available']}",
        f"- samples_with_segments: {summary['samples_with_segments']}",
        f"- samples_missing_segments: {summary['samples_missing_segments']}",
        f"- segments_total: {summary['segments_total']}",
        f"- segments_with_transcript: {summary['segments_with_transcript']}",
        f"- high_risk_segments: {summary['high_risk_segments']}",
        f"- medium_risk_segments: {summary['medium_risk_segments']}",
        f"- draft_candidate_turns: {summary['draft_candidate_turns']}",
        "",
        "## High risk segments",
        "",
    ]
    if high_risk:
        for row in high_risk:
            lines.extend(
                [
                    f"### {row['sample_id']} part {row['part_number']} segment {row['segment_index']}",
                    "",
                    f"- time: {row['start_seconds']} - {row['end_seconds']} ({row['duration_seconds']}s)",
                    f"- reasons: {row['risk_reasons']}",
                    f"- transcript: {row['transcript_preview']}",
                    "",
                ]
            )
    else:
        lines.extend(["No high risk segments found.", ""])

    lines.extend(["## Medium risk segments", ""])
    if medium_risk:
        for row in medium_risk:
            lines.extend(
                [
                    f"- {row['sample_id']} part {row['part_number']} segment {row['segment_index']}: "
                    f"{row['risk_reasons']}",
                ]
            )
    else:
        lines.append("No medium risk segments found.")

    lines.extend(["", "## Samples missing candidate_segments", ""])
    if missing_rows:
        for row in missing_rows:
            lines.append(f"- {row['sample_id']}: {row['local_audio_path']}")
    else:
        lines.append("No samples are missing candidate_segments.")

    lines.extend(["", "## Draft candidate turns", ""])
    if candidate_turns:
        grouped: dict[str, int] = {}
        for turn in candidate_turns:
            grouped[turn["sample_id"]] = grouped.get(turn["sample_id"], 0) + 1
        for sample_id, count in sorted(grouped.items()):
            lines.append(f"- {sample_id}: {count} draft turns")
    else:
        lines.append("No draft candidate turns generated.")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_proposed_segments(candidate_turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for turn in candidate_turns:
        grouped.setdefault(str(turn["sample_id"]), []).append(turn)

    proposed_rows: list[dict[str, Any]] = []
    for sample_id, turns in sorted(grouped.items()):
        segments = []
        for turn in sorted(turns, key=lambda item: (int(item["part_number"]), float(item["start_seconds"]))):
            segments.append(
                {
                    "part_number": turn["part_number"],
                    "prompt_type": turn.get("prompt_type"),
                    "prompt": turn.get("prompt_guess"),
                    "start_seconds": turn["start_seconds"],
                    "end_seconds": turn["end_seconds"],
                    "source_segment_index": turn["source_segment_index"],
                    "source_turn_index": turn["turn_index"],
                    "review_status": "draft_needs_human_review",
                }
            )
        proposed_rows.append(
            {
                "sample_id": sample_id,
                "source": "phase_1_1_asr_word_timestamp_heuristic",
                "proposed_candidate_segments": segments,
            }
        )
    return proposed_rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit IELTS Speaking candidate segment quality.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--details", default="evaluation/reports/predictions.baseline.details.jsonl")
    parser.add_argument("--output-dir", default="evaluation/reports/segment_audit")
    parser.add_argument("--min-turn-duration-seconds", type=float, default=1.5)
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    output_dir = (service_root / args.output_dir) if not Path(args.output_dir).is_absolute() else Path(args.output_dir)
    details_path = (service_root / args.details) if args.details and not Path(args.details).is_absolute() else Path(args.details)

    rows = load_jsonl(metadata_path)
    metadata_errors = [error for row in rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    details_by_sample = load_details_by_sample(details_path if details_path and details_path.exists() else None)

    audit_rows: list[dict[str, Any]] = []
    review_rows: list[dict[str, Any]] = []
    missing_rows: list[dict[str, Any]] = []
    candidate_turns: list[dict[str, Any]] = []
    audio_available = 0
    samples_with_segments = 0

    for row in rows:
        sample_id = str(row["sample_id"])
        audio_path = resolve_project_path(service_root, row.get("local_audio_path"))
        audio_exists = bool(audio_path and audio_path.exists())
        if audio_exists:
            audio_available += 1

        segments = row.get("candidate_segments") or []
        if not segments:
            missing_rows.append(
                {
                    "sample_id": sample_id,
                    "local_audio_path": row.get("local_audio_path"),
                    "audio_exists": audio_exists,
                    "claimed_overall_band": row.get("claimed_overall_band"),
                    "has_criterion_breakdown": row.get("has_criterion_breakdown"),
                    "action": "add candidate-only timestamps before scoring",
                }
            )
            continue

        samples_with_segments += 1
        details = details_by_sample.get(sample_id, {})
        segment_results = details.get("segment_results") if isinstance(details.get("segment_results"), list) else []

        for segment_index, segment in enumerate(segments, start=1):
            part_number = int(segment.get("part_number", 0) or 0)
            start_seconds = float(segment.get("start_seconds", 0.0))
            end_seconds = float(segment.get("end_seconds", 0.0))
            duration = max(0.0, end_seconds - start_seconds)
            score_result = segment_results[segment_index - 1] if segment_index - 1 < len(segment_results) else {}
            transcript_text = str(score_result.get("transcript_text") or "")
            risk, reasons = risk_level(duration, part_number, transcript_text)
            word_count = count_words(transcript_text)
            questions = transcript_text.count("?")
            segment_audio_path = segment_output_path(service_root, sample_id, segment_index, part_number)
            output_row = {
                "sample_id": sample_id,
                "segment_index": segment_index,
                "part_number": part_number,
                "prompt_type": segment.get("prompt_type"),
                "start_seconds": round(start_seconds, 2),
                "end_seconds": round(end_seconds, 2),
                "duration_seconds": round(duration, 2),
                "audio_exists": audio_exists,
                "segment_audio_exists": segment_audio_path.exists(),
                "has_transcript": bool(transcript_text),
                "word_count": word_count,
                "question_mark_count": questions,
                "examiner_cue_count": len(cue_hits(transcript_text)),
                "risk_level": risk,
                "risk_reasons": "; ".join(reasons),
                "transcript_preview": compact_text(transcript_text),
                "local_audio_path": row.get("local_audio_path"),
                "segment_audio_path": str(segment_audio_path.relative_to(service_root)),
            }
            audit_rows.append(output_row)
            review_rows.append(
                {
                    **output_row,
                    "review_status": "needs_review" if risk in {"high", "medium", "unknown"} else "candidate_only_ok",
                    "corrected_start_seconds": "",
                    "corrected_end_seconds": "",
                    "candidate_only": "",
                    "reviewer_notes": "",
                }
            )
            candidate_turns.extend(
                draft_candidate_turns(
                    sample_id=sample_id,
                    segment_index=segment_index,
                    segment=segment,
                    score_result=score_result,
                    min_turn_duration_seconds=args.min_turn_duration_seconds,
                )
            )

    high_risk_segments = sum(1 for row in audit_rows if row["risk_level"] == "high")
    medium_risk_segments = sum(1 for row in audit_rows if row["risk_level"] == "medium")
    summary = {
        "samples_total": len(rows),
        "audio_available": audio_available,
        "samples_with_segments": samples_with_segments,
        "samples_missing_segments": len(missing_rows),
        "segments_total": len(audit_rows),
        "segments_with_transcript": sum(1 for row in audit_rows if row["has_transcript"]),
        "high_risk_segments": high_risk_segments,
        "medium_risk_segments": medium_risk_segments,
        "draft_candidate_turns": len(candidate_turns),
        "samples_with_draft_candidate_turns": len({turn["sample_id"] for turn in candidate_turns}),
        "details_source": str(details_path.relative_to(service_root)) if details_path else None,
    }
    proposed_segments = build_proposed_segments(candidate_turns)

    audit_fields = [
        "sample_id",
        "segment_index",
        "part_number",
        "prompt_type",
        "start_seconds",
        "end_seconds",
        "duration_seconds",
        "audio_exists",
        "segment_audio_exists",
        "has_transcript",
        "word_count",
        "question_mark_count",
        "examiner_cue_count",
        "risk_level",
        "risk_reasons",
        "transcript_preview",
        "local_audio_path",
        "segment_audio_path",
    ]
    review_fields = audit_fields + [
        "review_status",
        "corrected_start_seconds",
        "corrected_end_seconds",
        "candidate_only",
        "reviewer_notes",
    ]
    missing_fields = [
        "sample_id",
        "local_audio_path",
        "audio_exists",
        "claimed_overall_band",
        "has_criterion_breakdown",
        "action",
    ]
    candidate_turn_fields = [
        "sample_id",
        "source_segment_index",
        "turn_index",
        "part_number",
        "prompt_type",
        "prompt_guess",
        "start_seconds",
        "end_seconds",
        "duration_seconds",
        "word_count",
        "transcript_preview",
        "review_status",
        "needs_review_reason",
    ]

    write_csv(output_dir / "segment_audit.csv", audit_rows, audit_fields)
    write_csv(output_dir / "segment_review_template.csv", review_rows, review_fields)
    write_csv(output_dir / "missing_segments.csv", missing_rows, missing_fields)
    write_csv(output_dir / "candidate_turns.review.csv", candidate_turns, candidate_turn_fields)
    write_jsonl(output_dir / "candidate_turns.draft.jsonl", candidate_turns)
    write_jsonl(output_dir / "candidate_segments.proposed.jsonl", proposed_segments)
    (output_dir / "segment_audit.summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_markdown_report(
        output_dir / "segment_audit.md",
        summary=summary,
        audit_rows=audit_rows,
        missing_rows=missing_rows,
        candidate_turns=candidate_turns,
    )

    print(f"samples_total={summary['samples_total']}")
    print(f"audio_available={summary['audio_available']}")
    print(f"samples_with_segments={summary['samples_with_segments']}")
    print(f"samples_missing_segments={summary['samples_missing_segments']}")
    print(f"segments_total={summary['segments_total']}")
    print(f"segments_with_transcript={summary['segments_with_transcript']}")
    print(f"high_risk_segments={summary['high_risk_segments']}")
    print(f"medium_risk_segments={summary['medium_risk_segments']}")
    print(f"draft_candidate_turns={summary['draft_candidate_turns']}")
    print(f"wrote_output_dir={output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
