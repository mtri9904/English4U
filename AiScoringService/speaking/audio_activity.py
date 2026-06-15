from __future__ import annotations

from fastapi import HTTPException

from runtime_utils import get_python_module_status, is_python_module_available
from schemas import (
    SpeakingDiarizationAnalysis,
    SpeakingSpeakerSegment,
    SpeakingVadAnalysis,
    SpeakingVadSegment,
)
from settings import (
    SPEAKING_ENABLE_SPEAKER_DIARIZATION,
    SPEAKING_ENABLE_SILERO_VAD,
    SPEAKING_PYANNOTE_MAX_SPEAKERS,
    SPEAKING_PYANNOTE_MIN_SPEAKERS,
    SPEAKING_PYANNOTE_MODEL,
    SPEAKING_PYANNOTE_TOKEN,
    SPEAKING_SILERO_MIN_SILENCE_MS,
    SPEAKING_SILERO_MIN_SPEECH_MS,
    SPEAKING_SILERO_THRESHOLD,
    SPEAKING_VAD_MERGE_GAP_SECONDS,
)
from speaking.audio_codec import decode_audio_samples_with_pyav
from speaking.audio_evidence import build_speaking_pause_stats
from speaking.text_utils import shorten_evidence_text

silero_vad_cache: dict[str, object] = {}
pyannote_pipeline_cache: dict[str, object] = {}


def merge_speaking_vad_segments(
    segments: list[SpeakingVadSegment],
    *,
    max_gap_seconds: float,
) -> list[SpeakingVadSegment]:
    ordered = sorted(
        (segment for segment in segments if segment.end > segment.start),
        key=lambda segment: segment.start,
    )
    if not ordered:
        return []

    merged = [ordered[0]]
    for segment in ordered[1:]:
        previous = merged[-1]
        if segment.start - previous.end <= max_gap_seconds:
            previous.end = round(max(previous.end, segment.end), 3)
            continue
        merged.append(segment)
    return merged


def get_speaking_vad_pauses(segments: list[SpeakingVadSegment]) -> list[float]:
    return [
        max(0.0, current.start - previous.end)
        for previous, current in zip(segments, segments[1:])
        if current.start is not None and previous.end is not None
    ]


def get_silero_vad_runtime() -> tuple[object, object, object]:
    if "runtime" not in silero_vad_cache:
        from silero_vad import get_speech_timestamps, load_silero_vad, read_audio  # type: ignore

        silero_vad_cache["runtime"] = (
            load_silero_vad(),
            read_audio,
            get_speech_timestamps,
        )
    runtime = silero_vad_cache["runtime"]
    if not isinstance(runtime, tuple) or len(runtime) != 3:
        raise RuntimeError("Silero VAD runtime cache is invalid.")
    return runtime


def speaker_diarization_ready() -> bool:
    return bool(
        SPEAKING_PYANNOTE_TOKEN
        and is_python_module_available("pyannote.audio")
    )


def get_pyannote_pipeline() -> object:
    cache_key = SPEAKING_PYANNOTE_MODEL
    if cache_key not in pyannote_pipeline_cache:
        if not SPEAKING_PYANNOTE_TOKEN:
            raise RuntimeError("SPEAKING_PYANNOTE_TOKEN/HF_TOKEN is not configured.")
        from pyannote.audio import Pipeline  # type: ignore

        try:
            pipeline = Pipeline.from_pretrained(
                SPEAKING_PYANNOTE_MODEL,
                token=SPEAKING_PYANNOTE_TOKEN,
            )
        except TypeError:
            pipeline = Pipeline.from_pretrained(
                SPEAKING_PYANNOTE_MODEL,
                use_auth_token=SPEAKING_PYANNOTE_TOKEN,
            )

        try:
            import torch  # type: ignore

            if torch.cuda.is_available():
                pipeline.to(torch.device("cuda"))
        except Exception:
            pass

        pyannote_pipeline_cache[cache_key] = pipeline
    return pyannote_pipeline_cache[cache_key]


def build_diarization_analysis_from_segments(
    segments: list[SpeakingSpeakerSegment],
    *,
    model: str,
    enabled: bool = True,
    available: bool = True,
    exclusive: bool = False,
    warnings: list[str] | None = None,
) -> SpeakingDiarizationAnalysis:
    speaker_seconds: dict[str, float] = {}
    for segment in segments:
        speaker_seconds[segment.speaker] = speaker_seconds.get(segment.speaker, 0.0) + max(0.0, segment.end - segment.start)

    primary_speaker: str | None = None
    primary_speaker_ratio: float | None = None
    total_speech = sum(speaker_seconds.values())
    if speaker_seconds and total_speech > 0:
        primary_speaker = max(speaker_seconds.items(), key=lambda item: item[1])[0]
        primary_speaker_ratio = round(speaker_seconds[primary_speaker] / total_speech, 3)

    return SpeakingDiarizationAnalysis(
        engine="pyannote_community_1",
        is_available=available,
        is_enabled=enabled,
        model=model,
        speaker_count=len(speaker_seconds),
        speaker_turn_count=len(segments),
        primary_speaker=primary_speaker,
        primary_speaker_ratio=primary_speaker_ratio,
        exclusive_speaker_diarization=exclusive,
        segments=segments,
        warnings=warnings or [],
    )


def get_speaking_audio_tool_status() -> dict[str, object]:
    silero_status = get_python_module_status("silero_vad")
    whisperx_status = get_python_module_status("whisperx")
    pyannote_status = get_python_module_status("pyannote.audio")
    silero_available = bool(silero_status["available"])
    whisperx_available = bool(whisperx_status["available"])
    pyannote_available = bool(pyannote_status["available"])
    return {
        "silero_vad_enabled": SPEAKING_ENABLE_SILERO_VAD,
        "silero_vad_required": True,
        "silero_vad_available": silero_available,
        "silero_vad_ready": bool(SPEAKING_ENABLE_SILERO_VAD and silero_available),
        "silero_vad_error": silero_status["error"],
        "silero_threshold": SPEAKING_SILERO_THRESHOLD,
        "silero_min_speech_ms": SPEAKING_SILERO_MIN_SPEECH_MS,
        "silero_min_silence_ms": SPEAKING_SILERO_MIN_SILENCE_MS,
        "vad_merge_gap_seconds": SPEAKING_VAD_MERGE_GAP_SECONDS,
        "whisperx_available": whisperx_available,
        "whisperx_error": whisperx_status["error"],
        "pyannote_audio_available": pyannote_available,
        "pyannote_audio_error": pyannote_status["error"],
        "speaker_diarization_enabled": False,
        "speaker_diarization_scope": "local_full_interview_only",
        "speaker_diarization_submit_enabled": False,
        "local_full_interview_diarization_enabled": SPEAKING_ENABLE_SPEAKER_DIARIZATION,
        "speaker_diarization_ready": speaker_diarization_ready(),
        "speaker_diarization_model": SPEAKING_PYANNOTE_MODEL,
        "speaker_diarization_token_configured": bool(SPEAKING_PYANNOTE_TOKEN),
        "speaker_diarization_min_speakers": SPEAKING_PYANNOTE_MIN_SPEAKERS,
        "speaker_diarization_max_speakers": SPEAKING_PYANNOTE_MAX_SPEAKERS,
        "llm_refiner": "gemini",
    }


def raise_required_silero_vad_error(message: str) -> None:
    raise HTTPException(
        status_code=503,
        detail={
            "message": "Speaking scoring requires Silero VAD speech-activity evidence.",
            "errors": [message],
            "status": get_speaking_audio_tool_status(),
        },
    )


def raise_required_speaker_diarization_error(message: str) -> None:
    raise HTTPException(
        status_code=503,
        detail={
            "message": "Local full-interview speaker diarization is required for this operation.",
            "errors": [message],
            "status": get_speaking_audio_tool_status(),
        },
    )


def extract_pyannote_segments(annotation: object) -> list[SpeakingSpeakerSegment]:
    segments: list[SpeakingSpeakerSegment] = []
    if hasattr(annotation, "itertracks"):
        for turn, _, speaker in annotation.itertracks(yield_label=True):
            start = round(float(getattr(turn, "start")), 3)
            end = round(float(getattr(turn, "end")), 3)
            if end > start:
                segments.append(SpeakingSpeakerSegment(start=start, end=end, speaker=str(speaker)))
        return segments

    try:
        iterable = iter(annotation)  # type: ignore[arg-type]
    except TypeError:
        return segments

    for item in iterable:
        try:
            turn, speaker = item
            start = round(float(getattr(turn, "start")), 3)
            end = round(float(getattr(turn, "end")), 3)
        except Exception:
            continue
        if end > start:
            segments.append(SpeakingSpeakerSegment(start=start, end=end, speaker=str(speaker)))
    return segments


def build_pyannote_diarization_kwargs(
    *,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> dict[str, int]:
    kwargs: dict[str, int] = {}
    if num_speakers is not None:
        kwargs["num_speakers"] = int(num_speakers)
        return kwargs
    if min_speakers is not None:
        kwargs["min_speakers"] = int(min_speakers)
    if max_speakers is not None:
        kwargs["max_speakers"] = int(max_speakers)
    return kwargs


def run_pyannote_speaker_diarization(
    audio_path: str | None,
    *,
    num_speakers: int | None = None,
    min_speakers: int | None = None,
    max_speakers: int | None = None,
) -> SpeakingDiarizationAnalysis:
    if not audio_path:
        raise RuntimeError("Audio path is required for local speaker diarization.")
    if not is_python_module_available("pyannote.audio"):
        raise RuntimeError("pyannote.audio is not installed.")
    if not SPEAKING_PYANNOTE_TOKEN:
        raise RuntimeError(
            "SPEAKING_PYANNOTE_TOKEN/HF_TOKEN is not configured. Accept the pyannote model terms and add a free Hugging Face token."
        )

    try:
        pipeline = get_pyannote_pipeline()
        kwargs = build_pyannote_diarization_kwargs(
            num_speakers=num_speakers,
            min_speakers=SPEAKING_PYANNOTE_MIN_SPEAKERS if min_speakers is None else min_speakers,
            max_speakers=SPEAKING_PYANNOTE_MAX_SPEAKERS if max_speakers is None else max_speakers,
        )
        try:
            import torch  # type: ignore

            samples, _, _, _, _ = decode_audio_samples_with_pyav(audio_path)
            waveform = torch.tensor(samples, dtype=torch.float32).unsqueeze(0)
            result = pipeline({"waveform": waveform, "sample_rate": 16000}, **kwargs)
        except Exception:
            result = pipeline(audio_path, **kwargs)
    except Exception as ex:
        raise RuntimeError(f"pyannote speaker diarization failed: {shorten_evidence_text(str(ex), max_length=180)}") from ex

    annotation = getattr(result, "exclusive_speaker_diarization", None)
    exclusive = annotation is not None
    if annotation is None:
        annotation = getattr(result, "speaker_diarization", None)
    if annotation is None:
        annotation = result

    segments = extract_pyannote_segments(annotation)
    warnings: list[str] = []
    if not segments:
        warnings.append("pyannote returned no speaker segments.")
    return build_diarization_analysis_from_segments(
        segments,
        model=SPEAKING_PYANNOTE_MODEL,
        enabled=True,
        available=True,
        exclusive=exclusive,
        warnings=warnings,
    )


def analyze_speaking_speaker_diarization(audio_path: str | None) -> SpeakingDiarizationAnalysis | None:
    if not SPEAKING_ENABLE_SPEAKER_DIARIZATION:
        return None
    try:
        return run_pyannote_speaker_diarization(audio_path)
    except RuntimeError as ex:
        raise_required_speaker_diarization_error(str(ex))
    return None


def analyze_speaking_speech_activity(
    audio_path: str | None,
    *,
    duration_seconds: float | None,
) -> SpeakingVadAnalysis | None:
    if not audio_path:
        return None

    if not SPEAKING_ENABLE_SILERO_VAD:
        raise_required_silero_vad_error("Silero VAD is disabled.")
    if not is_python_module_available("silero_vad"):
        raise_required_silero_vad_error("Silero VAD is not installed.")

    try:
        model, read_audio, get_speech_timestamps = get_silero_vad_runtime()
        try:
            import torch  # type: ignore

            samples, _, _, _, _ = decode_audio_samples_with_pyav(audio_path)
            wav = torch.tensor(samples, dtype=torch.float32)
        except Exception:
            wav = read_audio(audio_path, sampling_rate=16000)
        try:
            raw_segments = get_speech_timestamps(
                wav,
                model,
                sampling_rate=16000,
                threshold=SPEAKING_SILERO_THRESHOLD,
                min_speech_duration_ms=int(SPEAKING_SILERO_MIN_SPEECH_MS),
                min_silence_duration_ms=int(SPEAKING_SILERO_MIN_SILENCE_MS),
                return_seconds=True,
            )
            vad_segments = [
                SpeakingVadSegment(
                    start=round(float(item["start"]), 3),
                    end=round(float(item["end"]), 3),
                )
                for item in raw_segments
                if isinstance(item, dict) and "start" in item and "end" in item
            ]
        except TypeError:
            raw_segments = get_speech_timestamps(
                wav,
                model,
                sampling_rate=16000,
                threshold=SPEAKING_SILERO_THRESHOLD,
                min_speech_duration_ms=int(SPEAKING_SILERO_MIN_SPEECH_MS),
                min_silence_duration_ms=int(SPEAKING_SILERO_MIN_SILENCE_MS),
            )
            vad_segments = [
                SpeakingVadSegment(
                    start=round(float(item["start"]) / 16000.0, 3),
                    end=round(float(item["end"]) / 16000.0, 3),
                )
                for item in raw_segments
                if isinstance(item, dict) and "start" in item and "end" in item
            ]
    except Exception as ex:
        raise_required_silero_vad_error(f"Silero VAD failed: {shorten_evidence_text(str(ex), max_length=140)}")

    merged_segments = merge_speaking_vad_segments(
        vad_segments,
        max_gap_seconds=SPEAKING_VAD_MERGE_GAP_SECONDS,
    )
    speech_seconds = sum(max(0.0, segment.end - segment.start) for segment in merged_segments)
    effective_duration = duration_seconds
    if not effective_duration or effective_duration <= 0:
        effective_duration = max((segment.end for segment in merged_segments), default=None)
    speech_ratio = (
        round(min(1.0, max(0.0, speech_seconds / effective_duration)), 3)
        if effective_duration and effective_duration > 0
        else None
    )

    return SpeakingVadAnalysis(
        engine="silero_vad",
        is_available=True,
        segment_count=len(merged_segments),
        speech_seconds=round(speech_seconds, 2),
        speech_ratio=speech_ratio,
        pause_stats=build_speaking_pause_stats(get_speaking_vad_pauses(merged_segments)),
        segments=merged_segments[:80],
    )
