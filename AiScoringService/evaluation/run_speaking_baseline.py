from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import wave
from pathlib import Path
from typing import Any

import requests

from speaking_eval_common import SPEAKING_CRITERIA, load_jsonl, validate_metadata_row


DEFAULT_BASE_URL = "http://127.0.0.1:8000"


def resolve_service_root(metadata_path: Path) -> Path:
    return metadata_path.parents[1] if metadata_path.parent.name == "evaluation" else Path.cwd()


def resolve_audio_path(service_root: Path, raw_path: str | None) -> Path | None:
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.is_absolute() else service_root / path


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


def prepared_segment_path(
    service_root: Path,
    segments_root: Path,
    sample_id: str,
    segment_index: int,
    part_number: int,
) -> Path:
    folder = segments_root if segments_root.is_absolute() else service_root / segments_root
    folder = folder / sample_id
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{sample_id}_part{part_number}_{segment_index:02d}.wav"


def cut_segment_with_pyav(source_path: Path, output_path: Path, start_seconds: float, end_seconds: float) -> None:
    import av  # type: ignore

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with av.open(str(source_path)) as container:
        audio_streams = [stream for stream in container.streams if stream.type == "audio"]
        if not audio_streams:
            raise RuntimeError(f"No audio stream found in {source_path}.")

        stream = audio_streams[0]
        try:
            container.seek(int(start_seconds / float(stream.time_base)), stream=stream, backward=True)
        except Exception:
            container.seek(0)

        resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
        with wave.open(str(output_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)

            wrote_samples = False
            for frame in container.decode(stream):
                frame_start = float(frame.time or 0.0)
                frame_duration = float(frame.samples or 0) / float(frame.sample_rate or 1)
                frame_end = frame_start + frame_duration
                if frame_end < start_seconds:
                    continue
                if frame_start > end_seconds:
                    break

                resampled_frames = resampler.resample(frame)
                if resampled_frames is None:
                    continue
                if not isinstance(resampled_frames, list):
                    resampled_frames = [resampled_frames]

                for resampled in resampled_frames:
                    data = resampled.to_ndarray().reshape(-1)
                    wav_file.writeframes(data.tobytes())
                    wrote_samples = True

            if not wrote_samples:
                raise RuntimeError(f"No samples were written for {source_path} {start_seconds}-{end_seconds}.")


def cut_segment_with_ffmpeg(
    ffmpeg_path: str,
    source_path: Path,
    output_path: Path,
    start_seconds: float,
    end_seconds: float,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    duration_seconds = max(0.01, end_seconds - start_seconds)
    command = [
        ffmpeg_path,
        "-y",
        "-ss",
        f"{start_seconds:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "unknown error").strip()
        raise RuntimeError(f"ffmpeg failed for {source_path}: {detail[:500]}")


def cut_segment(
    *,
    engine: str,
    ffmpeg_path: str | None,
    source_path: Path,
    output_path: Path,
    start_seconds: float,
    end_seconds: float,
) -> None:
    if engine == "ffmpeg":
        if not ffmpeg_path:
            raise RuntimeError("ffmpeg cut engine selected but ffmpeg was not found.")
        cut_segment_with_ffmpeg(ffmpeg_path, source_path, output_path, start_seconds, end_seconds)
        return
    cut_segment_with_pyav(source_path, output_path, start_seconds, end_seconds)


def post_score_speaking(
    *,
    base_url: str,
    audio_path: Path,
    sample_id: str,
    answer_id: str,
    segment: dict[str, Any],
    timeout_seconds: float,
) -> dict[str, Any]:
    part_number = int(segment.get("part_number") or 0)
    prompt_type = segment.get("prompt_type")
    duration = float(segment["end_seconds"]) - float(segment["start_seconds"])
    form_data: dict[str, str] = {
        "session_id": sample_id,
        "answer_id": answer_id,
        "part_number": str(part_number),
        "duration_seconds": f"{duration:.3f}",
    }
    if prompt_type:
        form_data["prompt_type"] = str(prompt_type)
    if segment.get("prompt"):
        form_data["question_prompt"] = str(segment["prompt"])
    target_duration = target_duration_seconds(part_number, str(prompt_type or ""))
    if target_duration is not None:
        form_data["target_duration_seconds"] = str(target_duration)

    with audio_path.open("rb") as handle:
        response = requests.post(
            f"{base_url.rstrip('/')}/api/ai/score-speaking",
            data=form_data,
            files={"audio": (audio_path.name, handle, "audio/wav")},
            timeout=timeout_seconds,
        )
    response.raise_for_status()
    return response.json()


def post_session_score(
    *,
    base_url: str,
    sample_id: str,
    answers: list[dict[str, Any]],
    timeout_seconds: float,
) -> dict[str, Any]:
    response = requests.post(
        f"{base_url.rstrip('/')}/api/ai/score-speaking-session",
        json={"session_id": sample_id, "answers": answers},
        timeout=timeout_seconds,
    )
    response.raise_for_status()
    return response.json()


def prediction_from_session(sample_id: str, session_result: dict[str, Any]) -> dict[str, Any]:
    rubrics = session_result.get("rubrics") if isinstance(session_result.get("rubrics"), list) else []
    criteria_scores = {
        str(item.get("criteria")): float(item.get("band"))
        for item in rubrics
        if item.get("criteria") in SPEAKING_CRITERIA and isinstance(item.get("band"), (int, float))
    }
    return {
        "sample_id": sample_id,
        "predicted_overall_band": float(session_result.get("overall_band", 0.0)),
        "predicted_criterion_scores": criteria_scores,
    }


def fallback_prediction_from_answers(sample_id: str, answers: list[dict[str, Any]]) -> dict[str, Any]:
    criteria_scores: dict[str, float] = {}
    for criteria in SPEAKING_CRITERIA:
        bands = []
        for answer in answers:
            for rubric in answer.get("rubrics", []):
                if rubric.get("criteria") == criteria and isinstance(rubric.get("band"), (int, float)):
                    bands.append(float(rubric["band"]))
        if bands:
            criteria_scores[criteria] = round(sum(bands) / len(bands) * 2) / 2

    overall = round(sum(criteria_scores.values()) / max(len(criteria_scores), 1) * 2) / 2
    return {
        "sample_id": sample_id,
        "predicted_overall_band": overall,
        "predicted_criterion_scores": criteria_scores,
        "aggregation_fallback": "average_answer_rubrics",
    }


def ready_rows(rows: list[dict[str, Any]], service_root: Path, include_overall_only: bool) -> list[dict[str, Any]]:
    selected = []
    for row in rows:
        audio_path = resolve_audio_path(service_root, row.get("local_audio_path"))
        if audio_path is None or not audio_path.exists():
            continue
        if not row.get("candidate_segments"):
            continue
        if not include_overall_only and not row.get("claimed_criterion_scores"):
            continue
        selected.append(row)
    return selected


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run baseline Speaking scoring for local evaluation audio.")
    parser.add_argument("--metadata", default="evaluation/youtube_silver_samples.jsonl")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output", default="evaluation/reports/predictions.baseline.jsonl")
    parser.add_argument("--details-output", default="evaluation/reports/predictions.baseline.details.jsonl")
    parser.add_argument("--segments-root", default="evaluation/segments")
    parser.add_argument("--sample-id", action="append", help="Limit to one or more sample IDs.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--timeout-seconds", type=float, default=300.0)
    parser.add_argument("--cut-engine", choices=["pyav", "ffmpeg"], default="pyav")
    parser.add_argument("--skip-existing-cuts", action="store_true")
    parser.add_argument("--include-overall-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cut-only", action="store_true")
    parser.add_argument("--stop-on-error", action="store_true")
    args = parser.parse_args()

    metadata_path = Path(args.metadata).resolve()
    service_root = resolve_service_root(metadata_path)
    rows = load_jsonl(metadata_path)
    metadata_errors = [error for row in rows for error in validate_metadata_row(row)]
    if metadata_errors:
        for error in metadata_errors:
            print(f"ERROR: {error}")
        return 1

    selected_rows = ready_rows(rows, service_root, args.include_overall_only)
    segments_root = Path(args.segments_root)
    if args.sample_id:
        wanted = set(args.sample_id)
        selected_rows = [row for row in selected_rows if row["sample_id"] in wanted]
    if args.limit is not None:
        selected_rows = selected_rows[: args.limit]

    ffmpeg_path = shutil.which("ffmpeg")
    print(f"selected_samples={len(selected_rows)}")
    print(f"cut_engine={args.cut_engine}")
    print(f"ffmpeg_found={bool(ffmpeg_path)}")
    for row in selected_rows:
        print(f"PLAN {row['sample_id']}: segments={len(row.get('candidate_segments', []))}, audio={row.get('local_audio_path')}")

    if args.dry_run:
        return 0

    predictions: list[dict[str, Any]] = []
    details: list[dict[str, Any]] = []
    for row in selected_rows:
        sample_id = str(row["sample_id"])
        source_audio = resolve_audio_path(service_root, row.get("local_audio_path"))
        assert source_audio is not None
        segment_results: list[dict[str, Any]] = []
        session_answers: list[dict[str, Any]] = []
        sample_errors: list[str] = []

        for index, segment in enumerate(row["candidate_segments"], start=1):
            part_number = int(segment["part_number"])
            segment_path = prepared_segment_path(service_root, segments_root, sample_id, index, part_number)
            try:
                if not (args.skip_existing_cuts and segment_path.exists()):
                    cut_segment(
                        engine=args.cut_engine,
                        ffmpeg_path=ffmpeg_path,
                        source_path=source_audio,
                        output_path=segment_path,
                        start_seconds=float(segment["start_seconds"]),
                        end_seconds=float(segment["end_seconds"]),
                    )
                print(f"CUT {sample_id} segment={index} -> {segment_path.relative_to(service_root)}")

                if args.cut_only:
                    continue

                answer_id = f"{sample_id}_part{part_number}_{index:02d}"
                score_result = post_score_speaking(
                    base_url=args.base_url,
                    audio_path=segment_path,
                    sample_id=sample_id,
                    answer_id=answer_id,
                    segment=segment,
                    timeout_seconds=args.timeout_seconds,
                )
                segment_results.append(score_result)
                session_answers.append({
                    "answer_id": answer_id,
                    "question_prompt": segment.get("prompt"),
                    "transcript_text": score_result.get("transcript_text"),
                    "part_number": part_number,
                    "prompt_type": segment.get("prompt_type"),
                    "duration_seconds": float(segment["end_seconds"]) - float(segment["start_seconds"]),
                    "target_duration_seconds": target_duration_seconds(part_number, segment.get("prompt_type")),
                    "rubrics": score_result.get("rubrics", []),
                    "no_response": bool(score_result.get("overall_band", 0) <= 1.0),
                })
                print(f"SCORED {answer_id}: band={score_result.get('overall_band')}")
            except Exception as ex:
                message = f"{sample_id} segment {index}: {ex}"
                sample_errors.append(message)
                print(f"ERROR {message}")
                if args.stop_on_error:
                    raise

        session_result: dict[str, Any] | None = None
        prediction: dict[str, Any] | None = None
        if not args.cut_only and session_answers:
            try:
                session_result = post_session_score(
                    base_url=args.base_url,
                    sample_id=sample_id,
                    answers=session_answers,
                    timeout_seconds=args.timeout_seconds,
                )
                prediction = prediction_from_session(sample_id, session_result)
                print(f"SESSION {sample_id}: band={prediction['predicted_overall_band']}")
            except Exception as ex:
                sample_errors.append(f"{sample_id} session aggregation: {ex}")
                prediction = fallback_prediction_from_answers(sample_id, session_answers)
                print(f"SESSION_FALLBACK {sample_id}: band={prediction['predicted_overall_band']}")

        if prediction is not None:
            predictions.append(prediction)
        details.append({
            "sample_id": sample_id,
            "segment_count": len(row.get("candidate_segments", [])),
            "segment_results": segment_results,
            "session_result": session_result,
            "errors": sample_errors,
        })

    if not args.cut_only:
        output_path = (service_root / args.output) if not Path(args.output).is_absolute() else Path(args.output)
        details_path = (
            service_root / args.details_output
            if not Path(args.details_output).is_absolute()
            else Path(args.details_output)
        )
        write_jsonl(output_path, predictions)
        write_jsonl(details_path, details)
        print(f"wrote_predictions={output_path}")
        print(f"wrote_details={details_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
