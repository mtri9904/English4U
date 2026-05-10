from __future__ import annotations

import argparse
import csv
import json
import os
import time
from pathlib import Path
from typing import Any

from faster_whisper import WhisperModel

from audit_speaking_segments import (
    compact_text,
    count_words,
    is_examiner_start,
    normalise_token,
    starts_with_phrase,
    words_to_text,
)
from speaking_eval_common import load_jsonl, validate_metadata_row


FULL_TRANSCRIPT_SCHEMA_VERSION = "speaking-full-transcript-v1"
TURN_DRAFT_SCHEMA_VERSION = "speaking-candidate-turn-draft-v1"

PART2_START_PHRASES = [
    ("please", "start", "talking"),
    ("please", "begin"),
    ("you", "can", "start"),
    ("you", "may", "start"),
    ("start", "speaking"),
    ("start", "talking"),
]

PART2_STOP_PHRASES = [
    ("please", "stop"),
    ("stop", "talking"),
    ("that's", "all"),
    ("thank", "you"),
]


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def resolve_audio_path(service_root: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.is_absolute() else service_root / path


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


def word_to_dict(word: Any) -> dict[str, Any]:
    return {
        "word": str(getattr(word, "word", "") or "").strip(),
        "start": round(float(getattr(word, "start", 0.0) or 0.0), 2),
        "end": round(float(getattr(word, "end", 0.0) or 0.0), 2),
        "probability": round(float(getattr(word, "probability", 0.0) or 0.0), 3),
    }


def segment_to_dict(segment: Any) -> dict[str, Any]:
    words = [word_to_dict(word) for word in (getattr(segment, "words", None) or [])]
    return {
        "id": getattr(segment, "id", None),
        "start": round(float(getattr(segment, "start", 0.0) or 0.0), 2),
        "end": round(float(getattr(segment, "end", 0.0) or 0.0), 2),
        "text": str(getattr(segment, "text", "") or "").strip(),
        "avg_logprob": round(float(getattr(segment, "avg_logprob", 0.0) or 0.0), 4),
        "no_speech_prob": round(float(getattr(segment, "no_speech_prob", 0.0) or 0.0), 4),
        "words": words,
    }


def flatten_words(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        word
        for segment in segments
        for word in segment.get("words", [])
        if isinstance(word, dict) and str(word.get("word", "")).strip()
    ]


def transcript_duration(segments: list[dict[str, Any]], words: list[dict[str, Any]]) -> float | None:
    word_ends = [float(word["end"]) for word in words if isinstance(word.get("end"), (int, float))]
    if word_ends:
        return round(max(word_ends), 2)
    segment_ends = [float(segment["end"]) for segment in segments if isinstance(segment.get("end"), (int, float))]
    if segment_ends:
        return round(max(segment_ends), 2)
    return None


def has_phrase(tokens: list[str], index: int, phrases: list[tuple[str, ...]]) -> bool:
    return any(starts_with_phrase(tokens, index, phrase) for phrase in phrases)


def infer_part_from_prompt(prompt: str, current_part: int) -> int:
    lowered = prompt.lower()
    if "first part" in lowered:
        return 1
    if "topic" in lowered and ("one to two minutes" in lowered or "1 to 2 minutes" in lowered):
        return 2
    if "related to this topic" in lowered or "questions related to this" in lowered:
        return 3
    return current_part


def infer_prompt_type(part_number: int) -> str:
    if part_number == 1:
        return "part1_short_answer"
    if part_number == 2:
        return "part2_long_turn"
    if part_number == 3:
        return "part3_discussion"
    return "unknown"


def part_number_from_boundaries(start_seconds: float, existing_segments: list[dict[str, Any]]) -> int | None:
    for segment in existing_segments:
        part_number = segment.get("part_number")
        start = segment.get("start_seconds")
        end = segment.get("end_seconds")
        if (
            part_number in {1, 2, 3}
            and isinstance(start, (int, float))
            and isinstance(end, (int, float))
            and float(start) <= start_seconds < float(end)
        ):
            return int(part_number)
    return None


def is_scoring_candidate_turn(prompt_text: str, part_number: int, start_seconds: float) -> bool:
    lowered = prompt_text.lower()
    intro_markers = [
        "full name",
        "where you're from",
        "where are you from",
        "identification",
        "identification please",
        "can i see",
        "could i see",
        "may i see",
    ]
    if any(marker in lowered for marker in intro_markers):
        return False
    if part_number not in {1, 2, 3}:
        return False
    if part_number == 1 and start_seconds < 18:
        return False
    return True


def trim_candidate_end(tokens: list[str], candidate_start_index: int, end_index: int) -> int:
    while end_index >= candidate_start_index and tokens[end_index] in {"okay", "right"}:
        end_index -= 1
    if (
        end_index - 1 >= candidate_start_index
        and tokens[end_index] == "good"
        and tokens[end_index - 1] == "okay"
    ):
        end_index -= 2
    return end_index


def build_turn(
    *,
    sample_id: str,
    words: list[dict[str, Any]],
    tokens: list[str],
    candidate_start_index: int,
    end_index: int,
    prompt_text: str,
    part_number: int,
    turn_index: int,
    min_turn_duration_seconds: float,
    reason: str,
    existing_segments: list[dict[str, Any]],
) -> dict[str, Any] | None:
    end_index = trim_candidate_end(tokens, candidate_start_index, end_index)
    if candidate_start_index < 0 or end_index < candidate_start_index:
        return None

    start_word = words[candidate_start_index]
    end_word = words[end_index]
    start_seconds = float(start_word.get("start", 0.0))
    end_seconds = float(end_word.get("end", end_word.get("start", 0.0)))
    boundary_part_number = part_number_from_boundaries(start_seconds, existing_segments)
    if boundary_part_number is not None:
        part_number = boundary_part_number
    duration = max(0.0, end_seconds - start_seconds)
    text = words_to_text(words, candidate_start_index, end_index)
    word_count = count_words(text)
    if duration < min_turn_duration_seconds or word_count < 3:
        return None

    return {
        "schema_version": TURN_DRAFT_SCHEMA_VERSION,
        "sample_id": sample_id,
        "turn_index": turn_index,
        "part_number": part_number,
        "prompt_type": infer_prompt_type(part_number),
        "prompt_guess": compact_text(prompt_text, 220) if prompt_text else None,
        "start_seconds": round(start_seconds, 2),
        "end_seconds": round(end_seconds, 2),
        "duration_seconds": round(duration, 2),
        "word_count": word_count,
        "transcript_preview": compact_text(text, 300),
        "scoring_candidate": is_scoring_candidate_turn(prompt_text, part_number, start_seconds),
        "review_status": "draft_needs_human_review",
        "needs_review_reason": reason,
    }


def detect_candidate_turns(
    *,
    sample_id: str,
    words: list[dict[str, Any]],
    existing_segments: list[dict[str, Any]],
    min_turn_duration_seconds: float,
) -> list[dict[str, Any]]:
    if not words:
        return []

    tokens = [normalise_token(str(word.get("word", ""))) for word in words]
    state = "examiner"
    current_part = 1
    prompt_start_index = 0
    candidate_start_index: int | None = None
    last_prompt = ""
    turns: list[dict[str, Any]] = []

    def add_turn(end_index: int, reason: str) -> None:
        nonlocal candidate_start_index
        if candidate_start_index is None:
            return
        turn = build_turn(
            sample_id=sample_id,
            words=words,
            tokens=tokens,
            candidate_start_index=candidate_start_index,
            end_index=end_index,
            prompt_text=last_prompt,
            part_number=current_part,
            turn_index=len(turns) + 1,
            min_turn_duration_seconds=min_turn_duration_seconds,
            reason=reason,
            existing_segments=existing_segments,
        )
        if turn is not None:
            turns.append(turn)
        candidate_start_index = None

    for index, word in enumerate(words):
        raw_word = str(word.get("word", ""))
        token = tokens[index]

        if state == "examiner":
            if has_phrase(tokens, index, PART2_START_PHRASES):
                prompt_text = words_to_text(words, prompt_start_index, index)
                current_part = infer_part_from_prompt(prompt_text, current_part)
                last_prompt = prompt_text
                state = "candidate"
                candidate_start_index = index + 1
                continue

            if "?" in raw_word:
                prompt_text = words_to_text(words, prompt_start_index, index)
                current_part = infer_part_from_prompt(prompt_text, current_part)
                last_prompt = prompt_text
                state = "candidate"
                candidate_start_index = index + 1
            continue

        if state == "candidate":
            if has_phrase(tokens, index, PART2_STOP_PHRASES):
                add_turn(index - 1, "part2_stop_cue")
                state = "examiner"
                prompt_start_index = index
                continue

            if token and is_examiner_start(tokens, index):
                add_turn(index - 1, "next_examiner_cue")
                state = "examiner"
                prompt_start_index = index
                if "?" in raw_word:
                    prompt_text = words_to_text(words, prompt_start_index, index)
                    current_part = infer_part_from_prompt(prompt_text, current_part)
                    last_prompt = prompt_text
                    state = "candidate"
                    candidate_start_index = index + 1

    if state == "candidate" and candidate_start_index is not None:
        add_turn(len(words) - 1, "end_of_audio")

    return turns


def proposed_segments_from_turns(candidate_turns: list[dict[str, Any]], *, scoring_only: bool = False) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for turn in candidate_turns:
        if scoring_only and not turn.get("scoring_candidate"):
            continue
        grouped.setdefault(str(turn["sample_id"]), []).append(turn)

    rows: list[dict[str, Any]] = []
    for sample_id, turns in sorted(grouped.items()):
        rows.append(
            {
                "sample_id": sample_id,
                "source": "phase_1_full_transcript_asr_word_timestamp_heuristic",
                "proposed_candidate_segments": [
                    {
                        "part_number": turn["part_number"],
                        "prompt_type": turn["prompt_type"],
                        "prompt": turn["prompt_guess"],
                        "start_seconds": turn["start_seconds"],
                        "end_seconds": turn["end_seconds"],
                        "review_status": turn["review_status"],
                    }
                    for turn in sorted(turns, key=lambda item: float(item["start_seconds"]))
                ],
            }
        )
    return rows


def load_existing_transcript(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        row = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return row if isinstance(row, dict) else None


def transcribe_audio(
    *,
    model: WhisperModel,
    sample_id: str,
    audio_path: Path,
    model_size: str,
    language: str,
    beam_size: int,
    vad_filter: bool,
) -> dict[str, Any]:
    started = time.perf_counter()
    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=beam_size,
        vad_filter=vad_filter,
        word_timestamps=True,
    )
    segments = [segment_to_dict(segment) for segment in segments_iter if str(getattr(segment, "text", "") or "").strip()]
    words = flatten_words(segments)
    transcript_text = " ".join(segment["text"].strip() for segment in segments if segment.get("text")).strip()
    duration = transcript_duration(segments, words)
    elapsed = round(time.perf_counter() - started, 2)
    return {
        "schema_version": FULL_TRANSCRIPT_SCHEMA_VERSION,
        "sample_id": sample_id,
        "audio_path": str(audio_path),
        "model_size": model_size,
        "language": language,
        "detected_language": getattr(info, "language", None),
        "language_probability": round(float(getattr(info, "language_probability", 0.0) or 0.0), 3),
        "duration_seconds": duration,
        "transcribe_seconds": elapsed,
        "segment_count": len(segments),
        "word_count": count_words(transcript_text),
        "transcript_text": transcript_text,
        "segments": segments,
        "words": words,
    }


def selected_rows(
    rows: list[dict[str, Any]],
    service_root: Path,
    sample_ids: list[str] | None,
    limit: int | None,
) -> list[dict[str, Any]]:
    wanted = set(sample_ids or [])
    selected: list[dict[str, Any]] = []
    for row in rows:
        if wanted and row["sample_id"] not in wanted:
            continue
        audio_path = resolve_audio_path(service_root, row.get("local_audio_path"))
        if audio_path is None or not audio_path.exists():
            continue
        selected.append(row)
    return selected[:limit] if limit is not None else selected


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcribe local IELTS Speaking audio with word timestamps.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--output-dir", default="evaluation/reports/full_transcripts")
    parser.add_argument("--model-size", default=os.getenv("WHISPER_MODEL_SIZE", "base"))
    parser.add_argument("--language", default="en")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--no-vad-filter", action="store_true")
    parser.add_argument("--sample-id", action="append")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--min-turn-duration-seconds", type=float, default=1.5)
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    output_dir = (service_root / args.output_dir) if not Path(args.output_dir).is_absolute() else Path(args.output_dir)

    rows = load_jsonl(metadata_path)
    metadata_errors = [error for row in rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    rows_to_process = selected_rows(rows, service_root, args.sample_id, args.limit)
    print(f"selected_audio={len(rows_to_process)}")
    print(f"model_size={args.model_size}")
    print(f"output_dir={output_dir}")
    if not rows_to_process:
        return 0

    model: WhisperModel | None = None
    transcript_rows: list[dict[str, Any]] = []
    candidate_turns: list[dict[str, Any]] = []
    index_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for row in rows_to_process:
        sample_id = str(row["sample_id"])
        audio_path = resolve_audio_path(service_root, row.get("local_audio_path"))
        assert audio_path is not None
        transcript_path = output_dir / f"{sample_id}.json"

        try:
            transcript_row = None
            if args.skip_existing:
                transcript_row = load_existing_transcript(transcript_path)

            if transcript_row is None:
                if model is None:
                    model = WhisperModel(args.model_size, device=args.device, compute_type=args.compute_type)
                print(f"TRANSCRIBE {sample_id}: {audio_path.relative_to(service_root)}")
                transcript_row = transcribe_audio(
                    model=model,
                    sample_id=sample_id,
                    audio_path=audio_path,
                    model_size=args.model_size,
                    language=args.language,
                    beam_size=args.beam_size,
                    vad_filter=not args.no_vad_filter,
                )
                write_json(transcript_path, transcript_row)
            else:
                print(f"SKIP_EXISTING {sample_id}: {transcript_path.relative_to(service_root)}")

            words = transcript_row.get("words") if isinstance(transcript_row, dict) else []
            turns = detect_candidate_turns(
                sample_id=sample_id,
                words=words if isinstance(words, list) else [],
                existing_segments=row.get("candidate_segments") if isinstance(row.get("candidate_segments"), list) else [],
                min_turn_duration_seconds=args.min_turn_duration_seconds,
            )
            candidate_turns.extend(turns)
            transcript_rows.append(
                {
                    "sample_id": sample_id,
                    "transcript_path": str(transcript_path.relative_to(service_root)),
                    "duration_seconds": transcript_row.get("duration_seconds"),
                    "segment_count": transcript_row.get("segment_count"),
                    "word_count": transcript_row.get("word_count"),
                    "candidate_turn_count": len(turns),
                    "model_size": transcript_row.get("model_size"),
                    "language_probability": transcript_row.get("language_probability"),
                }
            )
            index_rows.append(
                {
                    "sample_id": sample_id,
                    "local_audio_path": row.get("local_audio_path"),
                    "transcript_path": str(transcript_path.relative_to(service_root)),
                    "duration_seconds": transcript_row.get("duration_seconds"),
                    "word_count": transcript_row.get("word_count"),
                    "candidate_turn_count": len(turns),
                    "claimed_overall_band": row.get("claimed_overall_band"),
                    "has_criterion_breakdown": row.get("has_criterion_breakdown"),
                }
            )
            print(
                "DONE "
                f"{sample_id}: duration={transcript_row.get('duration_seconds')}s "
                f"words={transcript_row.get('word_count')} turns={len(turns)}"
            )
        except Exception as ex:
            message = str(ex)
            errors.append({"sample_id": sample_id, "error": message})
            print(f"ERROR {sample_id}: {message}")

    write_jsonl(output_dir / "full_transcripts.index.jsonl", transcript_rows)
    write_csv(
        output_dir / "full_transcripts.index.csv",
        index_rows,
        [
            "sample_id",
            "local_audio_path",
            "transcript_path",
            "duration_seconds",
            "word_count",
            "candidate_turn_count",
            "claimed_overall_band",
            "has_criterion_breakdown",
        ],
    )
    write_jsonl(output_dir / "candidate_turns.full_audio.draft.jsonl", candidate_turns)
    write_csv(
        output_dir / "candidate_turns.full_audio.review.csv",
        candidate_turns,
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
            "scoring_candidate",
            "review_status",
            "corrected_start_seconds",
            "corrected_end_seconds",
            "candidate_only",
            "reviewer_notes",
            "needs_review_reason",
        ],
    )
    write_jsonl(output_dir / "candidate_segments.full_audio.proposed.jsonl", proposed_segments_from_turns(candidate_turns))
    write_jsonl(
        output_dir / "candidate_segments.scoring.proposed.jsonl",
        proposed_segments_from_turns(candidate_turns, scoring_only=True),
    )

    summary = {
        "schema_version": FULL_TRANSCRIPT_SCHEMA_VERSION,
        "selected_audio": len(rows_to_process),
        "transcripts_written_or_loaded": len(transcript_rows),
        "errors": errors,
        "candidate_turns": len(candidate_turns),
        "scoring_candidate_turns": sum(1 for turn in candidate_turns if turn.get("scoring_candidate")),
        "samples_with_candidate_turns": len({turn["sample_id"] for turn in candidate_turns}),
        "model_size": args.model_size,
        "language": args.language,
        "vad_filter": not args.no_vad_filter,
    }
    write_json(output_dir / "full_transcripts.summary.json", summary)
    print(f"transcripts_written_or_loaded={summary['transcripts_written_or_loaded']}")
    print(f"errors={len(errors)}")
    print(f"candidate_turns={summary['candidate_turns']}")
    print(f"samples_with_candidate_turns={summary['samples_with_candidate_turns']}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
