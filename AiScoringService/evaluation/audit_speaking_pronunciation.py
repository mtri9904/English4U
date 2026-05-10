from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import SpeakingPauseStats, SpeakingPronunciationAnalysis, SpeakingWordTimestamp  # noqa: E402
from speaking.pronunciation import build_speaking_pronunciation_analysis  # noqa: E402
from speaking.text_utils import extract_speaking_tokens  # noqa: E402
from speaking_eval_common import load_jsonl, validate_metadata_row  # noqa: E402


SCHEMA_VERSION = "speaking-pronunciation-audit-v1"


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def resolve_project_path(service_root: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.is_absolute() else service_root / path


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


def compact_text(text: str, limit: int = 220) -> str:
    cleaned = " ".join(text.split())
    return cleaned if len(cleaned) <= limit else cleaned[: limit - 3].rstrip() + "..."


def target_duration_seconds(part_number: int | None, prompt_type: str | None) -> int | None:
    if prompt_type == "part2_long_turn":
        return 120
    if prompt_type == "part2_follow_up":
        return 35
    if part_number == 1:
        return 30
    if part_number == 2:
        return 35
    if part_number == 3:
        return 60
    return None


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


def transcript_segments_for_window(
    transcript_row: dict[str, Any],
    start_seconds: float,
    end_seconds: float,
) -> list[dict[str, Any]]:
    segments = transcript_row.get("segments")
    if not isinstance(segments, list):
        return []
    selected: list[dict[str, Any]] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        start = segment.get("start")
        end = segment.get("end")
        if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
            continue
        if float(end) <= start_seconds or float(start) >= end_seconds:
            continue
        selected.append(segment)
    return selected


def word_midpoint(word: dict[str, Any]) -> float | None:
    start = word.get("start")
    end = word.get("end")
    if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
        return None
    return (float(start) + float(end)) / 2.0


def slice_transcript_words_for_segment(
    words: list[dict[str, Any]],
    *,
    start_seconds: float,
    end_seconds: float,
) -> list[SpeakingWordTimestamp]:
    selected: list[SpeakingWordTimestamp] = []
    duration_seconds = max(0.0, end_seconds - start_seconds)
    for word in words:
        midpoint = word_midpoint(word)
        if midpoint is None or midpoint < start_seconds or midpoint > end_seconds:
            continue

        raw_start = float(word.get("start", midpoint))
        raw_end = float(word.get("end", midpoint))
        relative_start = max(0.0, raw_start - start_seconds)
        relative_end = min(duration_seconds, raw_end - start_seconds)
        if relative_end <= relative_start:
            continue

        probability = word.get("probability")
        selected.append(
            SpeakingWordTimestamp(
                word=str(word.get("word", "")).strip(),
                start=round(relative_start, 2),
                end=round(relative_end, 2),
                probability=round(float(probability), 3) if isinstance(probability, (int, float)) else None,
            )
        )
    return selected


def transcript_text_from_words(words: list[SpeakingWordTimestamp]) -> str:
    return " ".join(word.word.strip() for word in words if word.word and word.word.strip()).strip()


def pause_stats_from_word_timestamps(words: list[SpeakingWordTimestamp]) -> SpeakingPauseStats:
    pauses = [
        max(0.0, float(current.start) - float(previous.end))
        for previous, current in zip(words, words[1:])
        if current.start is not None and previous.end is not None
    ]
    counted = [pause for pause in pauses if pause >= 0.25]
    long_pauses = [pause for pause in pauses if pause >= 1.2]
    total = sum(counted)
    return SpeakingPauseStats(
        pause_count=len(counted),
        long_pause_count=len(long_pauses),
        total_pause_seconds=round(total, 2),
        average_pause_seconds=round(total / len(counted), 2) if counted else None,
        longest_pause_seconds=round(max(counted), 2) if counted else None,
    )


def average_no_speech_probability(segments: list[dict[str, Any]]) -> float | None:
    values = [
        float(segment["no_speech_prob"])
        for segment in segments
        if isinstance(segment.get("no_speech_prob"), (int, float))
    ]
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def build_pronunciation_feature_map(
    *,
    transcript: str,
    words: list[SpeakingWordTimestamp],
    duration_seconds: float,
    part_number: int | None,
    prompt_type: str | None,
    avg_no_speech_prob: float | None,
) -> dict[str, float | int | None]:
    tokens = extract_speaking_tokens(transcript)
    probabilities = [
        float(word.probability)
        for word in words
        if word.probability is not None
    ]
    mean_word_probability = (
        round(sum(probabilities) / len(probabilities), 3)
        if probabilities
        else None
    )
    low_confidence_ratio = (
        round(sum(1 for probability in probabilities if probability < 0.55) / len(probabilities), 3)
        if probabilities
        else 0.0
    )
    pause_stats = pause_stats_from_word_timestamps(words)
    total_word_seconds = sum(
        max(0.0, float(word.end) - float(word.start))
        for word in words
        if word.start is not None and word.end is not None
    )
    speech_ratio = round(min(1.0, max(0.0, total_word_seconds / duration_seconds)), 3) if duration_seconds > 0 else None
    pause_ratio = round(pause_stats.total_pause_seconds / duration_seconds, 3) if duration_seconds > 0 else 0.0
    target_duration = target_duration_seconds(part_number, prompt_type)
    return {
        "word_count": len(tokens),
        "duration_seconds": round(duration_seconds, 3),
        "words_per_minute": round(len(tokens) / duration_seconds * 60, 1) if tokens and duration_seconds > 0 else None,
        "mean_word_probability": mean_word_probability,
        "low_confidence_ratio": low_confidence_ratio,
        "pause_ratio": pause_ratio,
        "pause_count": pause_stats.pause_count,
        "long_pause_count": pause_stats.long_pause_count,
        "total_pause_seconds": pause_stats.total_pause_seconds,
        "average_pause_seconds": pause_stats.average_pause_seconds,
        "longest_pause_seconds": pause_stats.longest_pause_seconds,
        "speech_ratio": speech_ratio,
        "avg_no_speech_prob": avg_no_speech_prob,
        "target_duration_seconds": target_duration,
        "coverage_ratio": round(duration_seconds / target_duration, 3) if target_duration and target_duration > 0 else None,
    }


def prepared_segment_path(
    service_root: Path,
    segments_root: Path,
    sample_id: str,
    segment_index: int,
    part_number: int,
) -> Path:
    folder = segments_root if segments_root.is_absolute() else service_root / segments_root
    return folder / sample_id / f"{sample_id}_part{part_number}_{segment_index:02d}.wav"


def top_issue_summary(analysis: SpeakingPronunciationAnalysis, *, limit: int = 8) -> str:
    items = []
    for issue in analysis.issues[:limit]:
        label = issue.issue_type or "unknown"
        timing = f"@{issue.start:.2f}s" if issue.start is not None else ""
        items.append(f"{issue.word}:{label}{timing}")
    return "; ".join(items)


def analysis_to_row(
    *,
    sample: dict[str, Any],
    segment_index: int,
    segment: dict[str, Any],
    segment_audio: Path,
    transcript: str,
    words: list[SpeakingWordTimestamp],
    features: dict[str, float | int | None],
    analysis: SpeakingPronunciationAnalysis | None,
    error: str | None,
) -> dict[str, Any]:
    criteria = sample.get("claimed_criterion_scores")
    claimed_pronunciation = (
        criteria.get("Pronunciation")
        if isinstance(criteria, dict) and isinstance(criteria.get("Pronunciation"), (int, float))
        else None
    )
    duration_seconds = float(segment["end_seconds"]) - float(segment["start_seconds"])
    base = {
        "schema_version": SCHEMA_VERSION,
        "sample_id": sample.get("sample_id"),
        "segment_index": segment_index,
        "part_number": segment.get("part_number"),
        "prompt_type": segment.get("prompt_type"),
        "start_seconds": segment.get("start_seconds"),
        "end_seconds": segment.get("end_seconds"),
        "duration_seconds": round(duration_seconds, 2),
        "word_count": len(extract_speaking_tokens(transcript)),
        "audio_path": str(segment_audio),
        "audio_exists": segment_audio.exists(),
        "claimed_pronunciation_band": claimed_pronunciation,
        "transcript_preview": compact_text(transcript),
        "mean_word_probability": features.get("mean_word_probability"),
        "low_confidence_ratio": features.get("low_confidence_ratio"),
        "speech_ratio": features.get("speech_ratio"),
        "pause_ratio": features.get("pause_ratio"),
        "error": error,
    }
    if analysis is None:
        return base

    base.update({
        "engine": analysis.engine,
        "has_word_timing": analysis.has_word_timing,
        "has_phoneme_alignment": analysis.has_phoneme_alignment,
        "has_pitch_analysis": analysis.has_pitch_analysis,
        "has_actual_phone_recognition": analysis.has_actual_phone_recognition,
        "acoustic_pronunciation_score": analysis.acoustic_pronunciation_score,
        "acoustic_pronunciation_source": analysis.acoustic_pronunciation_source,
        "segmental_score": analysis.segmental_score,
        "prosody_score": analysis.prosody_score,
        "intelligibility_score": analysis.intelligibility_score,
        "phone_timing_score": analysis.phone_timing_score,
        "phone_timing_issue_ratio": analysis.phone_timing_issue_ratio,
        "phone_match_score": analysis.phone_match_score,
        "rhythm_score": analysis.rhythm_score,
        "stress_score": analysis.stress_score,
        "intonation_score": analysis.intonation_score,
        "chunking_score": analysis.chunking_score,
        "issue_count": analysis.issue_count,
        "pronunciation_risk_ratio": analysis.pronunciation_risk_ratio,
        "warning_count": len(analysis.engine_warnings),
        "warning_summary": compact_text(" | ".join(analysis.engine_warnings), 320),
        "top_issues": top_issue_summary(analysis),
    })
    return base


def score_segment_pronunciation(
    *,
    sample: dict[str, Any],
    segment_index: int,
    segment: dict[str, Any],
    segment_audio: Path,
    transcript_row: dict[str, Any],
) -> dict[str, Any]:
    start_seconds = float(segment["start_seconds"])
    end_seconds = float(segment["end_seconds"])
    duration_seconds = max(0.0, end_seconds - start_seconds)
    full_words = flatten_words(transcript_row)
    words = slice_transcript_words_for_segment(
        full_words,
        start_seconds=start_seconds,
        end_seconds=end_seconds,
    )
    transcript = transcript_text_from_words(words)
    transcript_segments = transcript_segments_for_window(transcript_row, start_seconds, end_seconds)
    features = build_pronunciation_feature_map(
        transcript=transcript,
        words=words,
        duration_seconds=duration_seconds,
        part_number=int(segment.get("part_number") or 0) or None,
        prompt_type=str(segment.get("prompt_type") or ""),
        avg_no_speech_prob=average_no_speech_probability(transcript_segments),
    )

    error: str | None = None
    analysis: SpeakingPronunciationAnalysis | None = None
    if not segment_audio.exists():
        error = f"Missing cut WAV: {segment_audio}"
    elif len(extract_speaking_tokens(transcript)) < 3:
        error = "Segment has fewer than 3 transcript words from full-transcript timestamps."
    else:
        try:
            analysis = build_speaking_pronunciation_analysis(
                word_timestamps=words,
                pause_stats=pause_stats_from_word_timestamps(words),
                features=features,
                audio_path=str(segment_audio),
                transcript=transcript,
            )
        except Exception as ex:
            error = compact_text(str(ex), 500)

    return analysis_to_row(
        sample=sample,
        segment_index=segment_index,
        segment=segment,
        segment_audio=segment_audio,
        transcript=transcript,
        words=words,
        features=features,
        analysis=analysis,
        error=error,
    )


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    score_fields = [
        "acoustic_pronunciation_score",
        "segmental_score",
        "prosody_score",
        "intelligibility_score",
        "phone_timing_score",
        "phone_match_score",
    ]
    summary: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "segments": len(rows),
        "errors": sum(1 for row in rows if row.get("error")),
        "with_phoneme_alignment": sum(1 for row in rows if row.get("has_phoneme_alignment")),
        "with_actual_phone_recognition": sum(1 for row in rows if row.get("has_actual_phone_recognition")),
        "with_pitch_analysis": sum(1 for row in rows if row.get("has_pitch_analysis")),
    }
    for field in score_fields:
        values = [
            float(row[field])
            for row in rows
            if isinstance(row.get(field), (int, float))
        ]
        if values:
            summary[f"{field}_avg"] = round(sum(values) / len(values), 3)
            summary[f"{field}_min"] = round(min(values), 3)
            summary[f"{field}_max"] = round(max(values), 3)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audit local pronunciation component scores for candidate-only Speaking WAV segments."
    )
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--segments-root", default="evaluation/segments")
    parser.add_argument("--transcript-dir", default="evaluation/reports/full_transcripts")
    parser.add_argument("--output-dir", default="evaluation/reports/pronunciation_audit")
    parser.add_argument("--sample-id", action="append", help="Limit to one or more sample IDs.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of selected samples.")
    parser.add_argument("--segment-limit", type=int, default=None, help="Limit segments per selected sample.")
    parser.add_argument("--allow-errors", action="store_true", help="Exit 0 even when some segments cannot be audited.")
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    rows = load_jsonl(metadata_path)
    metadata_errors = [error for row in rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    selected_rows = [
        row
        for row in rows
        if row.get("candidate_segments") and resolve_project_path(service_root, row.get("local_audio_path"))
    ]
    if args.sample_id:
        wanted = set(args.sample_id)
        selected_rows = [row for row in selected_rows if row.get("sample_id") in wanted]
    if args.limit is not None:
        selected_rows = selected_rows[: args.limit]

    segments_root = Path(args.segments_root)
    transcript_dir = Path(args.transcript_dir)
    if not transcript_dir.is_absolute():
        transcript_dir = service_root / transcript_dir
    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = service_root / output_dir

    audit_rows: list[dict[str, Any]] = []
    for sample in selected_rows:
        sample_id = str(sample["sample_id"])
        transcript_path = transcript_dir / f"{sample_id}.json"
        transcript_row = read_json(transcript_path)
        if transcript_row is None:
            for index, segment in enumerate(sample.get("candidate_segments", []), start=1):
                part_number = int(segment.get("part_number") or 0)
                segment_audio = prepared_segment_path(service_root, segments_root, sample_id, index, part_number)
                audit_rows.append(analysis_to_row(
                    sample=sample,
                    segment_index=index,
                    segment=segment,
                    segment_audio=segment_audio,
                    transcript="",
                    words=[],
                    features={},
                    analysis=None,
                    error=f"Missing full transcript JSON: {transcript_path}",
                ))
            continue

        segments = list(sample.get("candidate_segments", []))
        if args.segment_limit is not None:
            segments = segments[: args.segment_limit]
        for index, segment in enumerate(segments, start=1):
            part_number = int(segment.get("part_number") or 0)
            segment_audio = prepared_segment_path(service_root, segments_root, sample_id, index, part_number)
            row = score_segment_pronunciation(
                sample=sample,
                segment_index=index,
                segment=segment,
                segment_audio=segment_audio,
                transcript_row=transcript_row,
            )
            audit_rows.append(row)
            status = "ERROR" if row.get("error") else "OK"
            print(
                f"{status} {sample_id} segment={index} "
                f"acoustic={row.get('acoustic_pronunciation_score')} "
                f"segmental={row.get('segmental_score')} "
                f"prosody={row.get('prosody_score')} "
                f"intelligibility={row.get('intelligibility_score')}"
            )

    fieldnames = [
        "schema_version",
        "sample_id",
        "segment_index",
        "part_number",
        "prompt_type",
        "start_seconds",
        "end_seconds",
        "duration_seconds",
        "word_count",
        "audio_path",
        "audio_exists",
        "claimed_pronunciation_band",
        "engine",
        "has_word_timing",
        "has_phoneme_alignment",
        "has_pitch_analysis",
        "has_actual_phone_recognition",
        "acoustic_pronunciation_score",
        "segmental_score",
        "prosody_score",
        "intelligibility_score",
        "phone_timing_score",
        "phone_timing_issue_ratio",
        "phone_match_score",
        "rhythm_score",
        "stress_score",
        "intonation_score",
        "chunking_score",
        "issue_count",
        "pronunciation_risk_ratio",
        "mean_word_probability",
        "low_confidence_ratio",
        "speech_ratio",
        "pause_ratio",
        "warning_count",
        "warning_summary",
        "top_issues",
        "transcript_preview",
        "error",
    ]
    write_csv(output_dir / "pronunciation_audit.csv", audit_rows, fieldnames)
    write_jsonl(output_dir / "pronunciation_audit.details.jsonl", audit_rows)
    summary = summarize_rows(audit_rows)
    write_json(output_dir / "pronunciation_audit.summary.json", summary)
    print(f"segments={summary['segments']} errors={summary['errors']}")
    print(f"wrote={output_dir}")
    return 0 if args.allow_errors or summary["errors"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
