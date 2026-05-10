from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import Any


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from speaking_eval_common import load_jsonl, validate_metadata_row  # noqa: E402


SCHEMA_VERSION = "speaking-diarized-candidate-segments-v1"
APPROVED_STATUS = "candidate_only_ok"
MANUAL_STATUS = "manual_review_needed"
REJECTED_STATUS = "rejected_contaminated"

INTRO_PROMPT_PATTERN = re.compile(
    r"\b(full name|where (are you|you're) from|identification|can i see|could i see|may i see)\b",
    re.IGNORECASE,
)
PART2_TOPIC_PATTERN = re.compile(
    r"\b(topic|cue card|one to two minutes|1 to 2 minutes|preparation|make some notes)\b",
    re.IGNORECASE,
)
PART3_TOPIC_PATTERN = re.compile(
    r"\b(questions related to this topic|related to this topic|food and culture|culture changed)\b",
    re.IGNORECASE,
)


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        row = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return row if isinstance(row, dict) else None


def write_json(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(row, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def compact_text(text: str, limit: int = 260) -> str:
    cleaned = " ".join(text.split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 3].rstrip() + "..."


def count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?", text))


def word_text(words: list[dict[str, Any]], start_index: int, end_index: int) -> str:
    if end_index < start_index:
        return ""
    return " ".join(str(word.get("word", "")).strip() for word in words[start_index : end_index + 1]).strip()


def flatten_words(transcript_row: dict[str, Any]) -> list[dict[str, Any]]:
    words = transcript_row.get("words")
    if isinstance(words, list) and words:
        return [word for word in words if isinstance(word, dict) and str(word.get("word", "")).strip()]

    segments = transcript_row.get("segments")
    if not isinstance(segments, list):
        return []
    return [
        word
        for segment in segments
        if isinstance(segment, dict)
        for word in segment.get("words", [])
        if isinstance(word, dict) and str(word.get("word", "")).strip()
    ]


def speaker_segments(diarization_row: dict[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
    candidate_speaker = diarization_row.get("candidate_speaker_guess")
    diarization = diarization_row.get("diarization")
    if isinstance(diarization, dict):
        if not candidate_speaker:
            candidate_speaker = diarization.get("primary_speaker")
        raw_segments = diarization.get("segments")
    else:
        raw_segments = None
    segments = [
        {
            "start": float(segment["start"]),
            "end": float(segment["end"]),
            "speaker": str(segment["speaker"]),
        }
        for segment in raw_segments or []
        if (
            isinstance(segment, dict)
            and isinstance(segment.get("start"), (int, float))
            and isinstance(segment.get("end"), (int, float))
            and segment.get("speaker")
            and float(segment["end"]) > float(segment["start"])
        )
    ]
    segments.sort(key=lambda item: (item["start"], item["end"]))
    return str(candidate_speaker) if candidate_speaker else None, segments


def word_midpoint(word: dict[str, Any]) -> float | None:
    start = word.get("start")
    end = word.get("end")
    if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
        return None
    return (float(start) + float(end)) / 2.0


def assign_word_speaker(
    word: dict[str, Any],
    segments: list[dict[str, Any]],
    *,
    max_nearest_gap_seconds: float,
) -> str | None:
    midpoint = word_midpoint(word)
    if midpoint is None:
        return None

    best_speaker: str | None = None
    best_overlap = 0.0
    word_start = float(word.get("start", midpoint))
    word_end = float(word.get("end", midpoint))
    for segment in segments:
        overlap = min(word_end, segment["end"]) - max(word_start, segment["start"])
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = str(segment["speaker"])
        if segment["start"] <= midpoint <= segment["end"] and best_overlap <= 0:
            best_speaker = str(segment["speaker"])

    if best_speaker is not None:
        return best_speaker

    nearest_speaker: str | None = None
    nearest_gap: float | None = None
    for segment in segments:
        if midpoint < segment["start"]:
            gap = segment["start"] - midpoint
        elif midpoint > segment["end"]:
            gap = midpoint - segment["end"]
        else:
            gap = 0.0
        if nearest_gap is None or gap < nearest_gap:
            nearest_gap = gap
            nearest_speaker = str(segment["speaker"])

    if nearest_gap is not None and nearest_gap <= max_nearest_gap_seconds:
        return nearest_speaker
    return None


def assign_words_to_speakers(
    words: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    *,
    max_nearest_gap_seconds: float,
) -> list[dict[str, Any]]:
    assigned: list[dict[str, Any]] = []
    for index, word in enumerate(words):
        enriched = dict(word)
        enriched["_word_index"] = index
        enriched["_speaker"] = assign_word_speaker(
            word,
            segments,
            max_nearest_gap_seconds=max_nearest_gap_seconds,
        )
        assigned.append(enriched)
    return assigned


def merge_candidate_runs(
    runs: list[tuple[int, int]],
    words: list[dict[str, Any]],
    *,
    max_merge_gap_seconds: float,
    max_bridge_words: int,
) -> list[tuple[int, int]]:
    if not runs:
        return []

    merged = [runs[0]]
    for start_index, end_index in runs[1:]:
        previous_start, previous_end = merged[-1]
        previous_end_time = float(words[previous_end].get("end", words[previous_end].get("start", 0.0)) or 0.0)
        start_time = float(words[start_index].get("start", previous_end_time) or previous_end_time)
        bridge_word_count = max(0, start_index - previous_end - 1)
        gap_seconds = max(0.0, start_time - previous_end_time)
        bridge_text = word_text(words, previous_end + 1, start_index - 1).lower()
        can_bridge = (
            gap_seconds <= max_merge_gap_seconds
            and bridge_word_count <= max_bridge_words
            and "?" not in bridge_text
        )
        if can_bridge:
            merged[-1] = (previous_start, end_index)
        else:
            merged.append((start_index, end_index))
    return merged


def candidate_word_runs(
    words: list[dict[str, Any]],
    *,
    candidate_speaker: str,
    max_merge_gap_seconds: float,
    max_bridge_words: int,
) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    start_index: int | None = None
    end_index: int | None = None
    for index, word in enumerate(words):
        if word.get("_speaker") == candidate_speaker:
            if start_index is None:
                start_index = index
            end_index = index
        elif start_index is not None and end_index is not None:
            runs.append((start_index, end_index))
            start_index = None
            end_index = None
    if start_index is not None and end_index is not None:
        runs.append((start_index, end_index))
    return merge_candidate_runs(
        runs,
        words,
        max_merge_gap_seconds=max_merge_gap_seconds,
        max_bridge_words=max_bridge_words,
    )


def infer_part_from_prompt(prompt_text: str, current_part: int) -> int:
    if PART3_TOPIC_PATTERN.search(prompt_text):
        return 3
    if PART2_TOPIC_PATTERN.search(prompt_text):
        return 2
    lowered = prompt_text.lower()
    if "first part" in lowered:
        return 1
    return current_part


def infer_prompt_type(
    part_number: int,
    duration_seconds: float,
    prompt_text: str,
    *,
    part2_long_turn_emitted: bool,
) -> str:
    if part_number == 1:
        return "part1_short_answer"
    if part_number == 2:
        if not part2_long_turn_emitted:
            return "part2_long_turn"
        if duration_seconds >= 45 or PART2_TOPIC_PATTERN.search(prompt_text):
            return "part2_long_turn"
        return "part2_follow_up"
    if part_number == 3:
        return "part3_discussion"
    return "unknown"


def is_scoring_turn(prompt_text: str, part_number: int, start_seconds: float, word_count: int) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if INTRO_PROMPT_PATTERN.search(prompt_text):
        reasons.append("intro_or_id_check_prompt")
    if part_number not in {1, 2, 3}:
        reasons.append("unknown_part")
    if part_number == 1 and start_seconds < 18:
        reasons.append("early_part1_intro")
    if word_count < 3:
        reasons.append("too_few_words")
    return not reasons, reasons


def build_candidate_turns(
    *,
    sample_id: str,
    words: list[dict[str, Any]],
    candidate_speaker: str,
    min_turn_duration_seconds: float,
    min_turn_words: int,
    max_merge_gap_seconds: float,
    max_bridge_words: int,
) -> list[dict[str, Any]]:
    runs = candidate_word_runs(
        words,
        candidate_speaker=candidate_speaker,
        max_merge_gap_seconds=max_merge_gap_seconds,
        max_bridge_words=max_bridge_words,
    )

    turns: list[dict[str, Any]] = []
    current_part = 1
    previous_candidate_end = -1
    part2_long_turn_emitted = False
    last_part2_topic_prompt: str | None = None
    for start_index, end_index in runs:
        start_seconds = float(words[start_index].get("start", 0.0) or 0.0)
        end_seconds = float(words[end_index].get("end", words[end_index].get("start", 0.0)) or 0.0)
        duration_seconds = max(0.0, end_seconds - start_seconds)
        text = word_text(words, start_index, end_index)
        word_count = count_words(text)
        prompt_start = previous_candidate_end + 1
        prompt_text = word_text(words, prompt_start, start_index - 1)
        current_part = infer_part_from_prompt(prompt_text, current_part)
        if PART2_TOPIC_PATTERN.search(prompt_text):
            last_part2_topic_prompt = prompt_text
        if duration_seconds < min_turn_duration_seconds or word_count < min_turn_words:
            previous_candidate_end = end_index
            continue

        prompt_type = infer_prompt_type(
            current_part,
            duration_seconds,
            prompt_text,
            part2_long_turn_emitted=part2_long_turn_emitted,
        )
        if (
            prompt_type == "part2_long_turn"
            and last_part2_topic_prompt
            and not PART2_TOPIC_PATTERN.search(prompt_text)
        ):
            prompt_text = last_part2_topic_prompt
        scoring_candidate, review_reasons = is_scoring_turn(prompt_text, current_part, start_seconds, word_count)
        review_status = APPROVED_STATUS if scoring_candidate else REJECTED_STATUS
        if duration_seconds > 150 and current_part != 2:
            review_status = MANUAL_STATUS
            review_reasons.append("long_non_part2_turn")
        if prompt_type == "part2_long_turn":
            part2_long_turn_emitted = True

        turns.append({
            "schema_version": SCHEMA_VERSION,
            "sample_id": sample_id,
            "turn_index": len(turns) + 1,
            "part_number": current_part,
            "prompt_type": prompt_type,
            "prompt_guess": compact_text(prompt_text, 260) if prompt_text else None,
            "start_seconds": round(start_seconds, 2),
            "end_seconds": round(end_seconds, 2),
            "duration_seconds": round(duration_seconds, 2),
            "word_count": word_count,
            "transcript_preview": compact_text(text, 320),
            "candidate_speaker": candidate_speaker,
            "candidate_only": str(scoring_candidate).lower(),
            "scoring_candidate": str(scoring_candidate).lower(),
            "review_status": review_status,
            "needs_review_reason": "; ".join(review_reasons) if review_reasons else "diarized_candidate_speaker",
            "corrected_start_seconds": "",
            "corrected_end_seconds": "",
            "reviewer_notes": "",
        })
        previous_candidate_end = end_index
    return turns


def proposed_segments_from_turns(turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for turn in turns:
        if str(turn.get("candidate_only", "")).lower() != "true":
            continue
        grouped.setdefault(str(turn["sample_id"]), []).append(turn)

    rows: list[dict[str, Any]] = []
    for sample_id, sample_turns in sorted(grouped.items()):
        rows.append({
            "sample_id": sample_id,
            "source": SCHEMA_VERSION,
            "proposed_candidate_segments": [
                {
                    "part_number": int(turn["part_number"]),
                    "prompt_type": turn.get("prompt_type"),
                    "prompt": turn.get("prompt_guess"),
                    "start_seconds": float(turn["start_seconds"]),
                    "end_seconds": float(turn["end_seconds"]),
                    "review_status": turn.get("review_status"),
                }
                for turn in sorted(sample_turns, key=lambda item: float(item["start_seconds"]))
            ],
        })
    return rows


def parse_candidate_speaker_overrides(values: list[str] | None) -> dict[str, str]:
    overrides: dict[str, str] = {}
    for value in values or []:
        if "=" in value:
            sample_id, speaker = value.split("=", 1)
        elif ":" in value:
            sample_id, speaker = value.split(":", 1)
        else:
            continue
        sample_id = sample_id.strip()
        speaker = speaker.strip()
        if sample_id and speaker:
            overrides[sample_id] = speaker
    return overrides


def main() -> int:
    parser = argparse.ArgumentParser(description="Build candidate-only Speaking segments from full-audio ASR + pyannote diarization.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--transcript-dir", default="evaluation/reports/full_transcripts")
    parser.add_argument("--diarization-dir", default="evaluation/reports/full_diarization")
    parser.add_argument("--output-dir", default="evaluation/reports/diarized_candidate_segments")
    parser.add_argument("--sample-id", action="append")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--candidate-speaker", action="append", help="Override guessed speaker, e.g. sample_id=SPEAKER_00.")
    parser.add_argument("--min-turn-duration-seconds", type=float, default=1.5)
    parser.add_argument("--min-turn-words", type=int, default=3)
    parser.add_argument("--max-nearest-gap-seconds", type=float, default=0.35)
    parser.add_argument("--max-merge-gap-seconds", type=float, default=0.7)
    parser.add_argument("--max-bridge-words", type=int, default=2)
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    transcript_dir = (service_root / args.transcript_dir) if not Path(args.transcript_dir).is_absolute() else Path(args.transcript_dir)
    diarization_dir = (service_root / args.diarization_dir) if not Path(args.diarization_dir).is_absolute() else Path(args.diarization_dir)
    output_dir = (service_root / args.output_dir) if not Path(args.output_dir).is_absolute() else Path(args.output_dir)
    overrides = parse_candidate_speaker_overrides(args.candidate_speaker)

    metadata_rows = load_jsonl(metadata_path)
    metadata_errors = [error for row in metadata_rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    wanted = set(args.sample_id or [])
    selected_rows = [
        row
        for row in metadata_rows
        if (not wanted or row["sample_id"] in wanted)
        and (transcript_dir / f"{row['sample_id']}.json").exists()
        and (diarization_dir / f"{row['sample_id']}.json").exists()
    ]
    if args.limit is not None:
        selected_rows = selected_rows[: args.limit]

    print(f"selected_samples={len(selected_rows)}")
    print(f"transcript_dir={transcript_dir}")
    print(f"diarization_dir={diarization_dir}")
    print(f"output_dir={output_dir}")

    all_turns: list[dict[str, Any]] = []
    index_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for row in selected_rows:
        sample_id = str(row["sample_id"])
        transcript_row = read_json(transcript_dir / f"{sample_id}.json")
        diarization_row = read_json(diarization_dir / f"{sample_id}.json")
        try:
            if transcript_row is None:
                raise RuntimeError("Missing full transcript JSON.")
            if diarization_row is None:
                raise RuntimeError("Missing diarization JSON.")
            candidate_speaker, diarization_segments = speaker_segments(diarization_row)
            candidate_speaker = overrides.get(sample_id, candidate_speaker)
            if not candidate_speaker:
                raise RuntimeError("Could not infer candidate speaker.")
            words = flatten_words(transcript_row)
            assigned_words = assign_words_to_speakers(
                words,
                diarization_segments,
                max_nearest_gap_seconds=args.max_nearest_gap_seconds,
            )
            turns = build_candidate_turns(
                sample_id=sample_id,
                words=assigned_words,
                candidate_speaker=candidate_speaker,
                min_turn_duration_seconds=args.min_turn_duration_seconds,
                min_turn_words=args.min_turn_words,
                max_merge_gap_seconds=args.max_merge_gap_seconds,
                max_bridge_words=args.max_bridge_words,
            )
            all_turns.extend(turns)
            accepted = sum(1 for turn in turns if turn.get("candidate_only") == "true")
            index_rows.append({
                "sample_id": sample_id,
                "candidate_speaker": candidate_speaker,
                "word_count": len(words),
                "diarization_turns": len(diarization_segments),
                "candidate_turns": len(turns),
                "accepted_candidate_turns": accepted,
                "manual_review_needed": sum(1 for turn in turns if turn.get("review_status") == MANUAL_STATUS),
                "rejected": sum(1 for turn in turns if turn.get("review_status") == REJECTED_STATUS),
            })
            print(f"DONE {sample_id}: candidate_speaker={candidate_speaker} turns={len(turns)} accepted={accepted}")
        except Exception as ex:
            errors.append({"sample_id": sample_id, "error": str(ex)})
            print(f"ERROR {sample_id}: {ex}")

    proposed_rows = proposed_segments_from_turns(all_turns)
    write_csv(
        output_dir / "candidate_turns.diarized.review.csv",
        all_turns,
        [
            "sample_id",
            "turn_index",
            "part_number",
            "prompt_type",
            "prompt_guess",
            "start_seconds",
            "end_seconds",
            "duration_seconds",
            "word_count",
            "transcript_preview",
            "candidate_speaker",
            "candidate_only",
            "scoring_candidate",
            "review_status",
            "corrected_start_seconds",
            "corrected_end_seconds",
            "reviewer_notes",
            "needs_review_reason",
        ],
    )
    write_jsonl(output_dir / "candidate_segments.diarized.proposed.jsonl", proposed_rows)
    write_csv(
        output_dir / "candidate_segments.diarized.index.csv",
        index_rows,
        [
            "sample_id",
            "candidate_speaker",
            "word_count",
            "diarization_turns",
            "candidate_turns",
            "accepted_candidate_turns",
            "manual_review_needed",
            "rejected",
        ],
    )
    write_json(
        output_dir / "candidate_segments.diarized.summary.json",
        {
            "schema_version": SCHEMA_VERSION,
            "selected_samples": len(selected_rows),
            "candidate_turns": len(all_turns),
            "accepted_candidate_turns": sum(1 for turn in all_turns if turn.get("candidate_only") == "true"),
            "proposed_samples": len(proposed_rows),
            "errors": errors,
        },
    )
    print(f"candidate_turns={len(all_turns)}")
    print(f"accepted_candidate_turns={sum(1 for turn in all_turns if turn.get('candidate_only') == 'true')}")
    print(f"errors={len(errors)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
