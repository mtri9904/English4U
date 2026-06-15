from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path
from typing import Any


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from schemas import SpeakingDiarizationAnalysis  # noqa: E402
from speaking.audio_activity import run_pyannote_speaker_diarization  # noqa: E402
from speaking_eval_common import load_jsonl, validate_metadata_row  # noqa: E402


DIARIZATION_SCHEMA_VERSION = "speaking-full-interview-diarization-v1"


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def resolve_audio_path(service_root: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.is_absolute() else service_root / path


def model_to_dict(value: Any) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return dict(value)


def write_json(path: Path, row: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(row, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


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


def load_existing_result(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        row = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return row if isinstance(row, dict) else None


def analysis_from_existing(row: dict[str, Any]) -> SpeakingDiarizationAnalysis | None:
    diarization = row.get("diarization")
    if not isinstance(diarization, dict):
        return None
    try:
        return SpeakingDiarizationAnalysis(**diarization)
    except Exception:
        return None


def build_result_row(
    *,
    sample_id: str,
    audio_path: Path,
    service_root: Path,
    analysis: SpeakingDiarizationAnalysis,
    elapsed_seconds: float | None,
) -> dict[str, Any]:
    return {
        "schema_version": DIARIZATION_SCHEMA_VERSION,
        "sample_id": sample_id,
        "audio_path": str(audio_path.relative_to(service_root)) if audio_path.is_relative_to(service_root) else str(audio_path),
        "candidate_speaker_guess": analysis.primary_speaker,
        "candidate_speaker_guess_reason": "longest_total_speech_time",
        "elapsed_seconds": elapsed_seconds,
        "diarization": model_to_dict(analysis),
    }


def speaker_turn_rows(
    *,
    sample_id: str,
    analysis: SpeakingDiarizationAnalysis,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, segment in enumerate(analysis.segments, start=1):
        rows.append({
            "sample_id": sample_id,
            "turn_index": index,
            "speaker": segment.speaker,
            "start_seconds": round(segment.start, 3),
            "end_seconds": round(segment.end, 3),
            "duration_seconds": round(max(0.0, segment.end - segment.start), 3),
            "candidate_speaker_guess": str(segment.speaker == analysis.primary_speaker).lower(),
            "speaker_count": analysis.speaker_count,
            "primary_speaker": analysis.primary_speaker,
            "primary_speaker_ratio": analysis.primary_speaker_ratio,
            "review_candidate_only": "",
            "reviewer_notes": "",
        })
    return rows


def index_row(
    *,
    sample_id: str,
    local_audio_path: str | None,
    result_path: Path,
    service_root: Path,
    analysis: SpeakingDiarizationAnalysis,
    status: str,
) -> dict[str, Any]:
    return {
        "sample_id": sample_id,
        "local_audio_path": local_audio_path,
        "speaker_count": analysis.speaker_count,
        "speaker_turn_count": analysis.speaker_turn_count,
        "primary_speaker": analysis.primary_speaker,
        "primary_speaker_ratio": analysis.primary_speaker_ratio,
        "exclusive_speaker_diarization": analysis.exclusive_speaker_diarization,
        "candidate_speaker_guess": analysis.primary_speaker,
        "status": status,
        "warnings": "; ".join(analysis.warnings),
        "result_path": str(result_path.relative_to(service_root)) if result_path.is_relative_to(service_root) else str(result_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Diarize local full IELTS Speaking interview audio with pyannote.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--output-dir", default="evaluation/reports/full_diarization")
    parser.add_argument("--sample-id", action="append")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--num-speakers", type=int, default=2, help="Use 2 for full IELTS examiner + candidate audio. Use 0 to disable.")
    parser.add_argument("--min-speakers", type=int, default=None)
    parser.add_argument("--max-speakers", type=int, default=None)
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
    print(f"output_dir={output_dir}")
    if not rows_to_process:
        return 0

    num_speakers = args.num_speakers if args.num_speakers and args.num_speakers > 0 else None
    all_turn_rows: list[dict[str, Any]] = []
    index_rows: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for row in rows_to_process:
        sample_id = str(row["sample_id"])
        audio_path = resolve_audio_path(service_root, row.get("local_audio_path"))
        assert audio_path is not None
        result_path = output_dir / f"{sample_id}.json"

        try:
            existing = load_existing_result(result_path) if args.skip_existing else None
            analysis = analysis_from_existing(existing) if existing else None
            status = "loaded_existing" if analysis is not None else "created"
            elapsed_seconds: float | None = None

            if analysis is None:
                print(f"DIARIZE {sample_id}: {audio_path.relative_to(service_root)}")
                started = time.perf_counter()
                analysis = run_pyannote_speaker_diarization(
                    str(audio_path),
                    num_speakers=num_speakers,
                    min_speakers=args.min_speakers,
                    max_speakers=args.max_speakers,
                )
                elapsed_seconds = round(time.perf_counter() - started, 2)
                write_json(
                    result_path,
                    build_result_row(
                        sample_id=sample_id,
                        audio_path=audio_path,
                        service_root=service_root,
                        analysis=analysis,
                        elapsed_seconds=elapsed_seconds,
                    ),
                )
            else:
                print(f"SKIP_EXISTING {sample_id}: {result_path.relative_to(service_root)}")

            all_turn_rows.extend(speaker_turn_rows(sample_id=sample_id, analysis=analysis))
            index_rows.append(
                index_row(
                    sample_id=sample_id,
                    local_audio_path=row.get("local_audio_path"),
                    result_path=result_path,
                    service_root=service_root,
                    analysis=analysis,
                    status=status,
                )
            )
            print(
                "DONE "
                f"{sample_id}: speakers={analysis.speaker_count} turns={analysis.speaker_turn_count} "
                f"candidate_guess={analysis.primary_speaker}"
            )
        except Exception as ex:
            message = str(ex)
            errors.append({"sample_id": sample_id, "error": message})
            print(f"ERROR {sample_id}: {message}")

    write_csv(
        output_dir / "full_diarization.index.csv",
        index_rows,
        [
            "sample_id",
            "local_audio_path",
            "speaker_count",
            "speaker_turn_count",
            "primary_speaker",
            "primary_speaker_ratio",
            "exclusive_speaker_diarization",
            "candidate_speaker_guess",
            "status",
            "warnings",
            "result_path",
        ],
    )
    write_csv(
        output_dir / "speaker_turns.review.csv",
        all_turn_rows,
        [
            "sample_id",
            "turn_index",
            "speaker",
            "start_seconds",
            "end_seconds",
            "duration_seconds",
            "candidate_speaker_guess",
            "speaker_count",
            "primary_speaker",
            "primary_speaker_ratio",
            "review_candidate_only",
            "reviewer_notes",
        ],
    )
    write_json(
        output_dir / "full_diarization.summary.json",
        {
            "schema_version": DIARIZATION_SCHEMA_VERSION,
            "selected_audio": len(rows_to_process),
            "processed": len(index_rows),
            "speaker_turns": len(all_turn_rows),
            "errors": errors,
            "num_speakers": num_speakers,
            "min_speakers": args.min_speakers,
            "max_speakers": args.max_speakers,
        },
    )
    print(f"processed={len(index_rows)}")
    print(f"errors={len(errors)}")
    print(f"speaker_turns={len(all_turn_rows)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
