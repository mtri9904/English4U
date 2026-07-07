from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from collections.abc import Callable

from fastapi import UploadFile
from faster_whisper.transcribe import Segment

from schemas import ScoreResponse, SpeakingAudioQuality
from speaking.audio_codec import is_wav_file_path, normalize_audio_to_16khz_mono_wav
from speaking.audio_evidence import (
    analyze_wav_audio_quality,
)
from speaking.band_utils import round_band_half
from speaking.response_scoring import score_speaking_rubrics

logger = logging.getLogger(__name__)

TranscribeAudioFile = Callable[..., tuple[list[Segment], str]]

whisper_lock = asyncio.Lock()



async def score_speaking_answer_response(
    *,
    audio: UploadFile | None,
    session_id: str,
    answer_id: str,
    question_prompt: str | None,
    transcript_text: str | None,
    part_number: int | None,
    prompt_type: str | None,
    target_duration_seconds: float | None,
    duration_seconds: float | None,
    transcribe_audio_file: TranscribeAudioFile,
    whisper_loaded: bool,
    gemini_client: object | None,
) -> ScoreResponse:
    transcript = (transcript_text or "").strip()
    segments: list[Segment] = []
    audio_quality: SpeakingAudioQuality | None = None
    analysis_path_for_scoring: str | None = None
    cleanup_paths: list[str] = []

    if audio is not None:
        if not whisper_loaded:
            raise RuntimeError("Whisper model not loaded.")

        suffix = os.path.splitext(audio.filename or ".wav")[1]
        normalized_tmp_path: str | None = None
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name
            cleanup_paths.append(tmp_path)

        try:
            analysis_path, normalized_tmp_path, normalization_warning = await asyncio.to_thread(
                normalize_audio_to_16khz_mono_wav,
                tmp_path,
            )
            if not is_wav_file_path(analysis_path):
                raise RuntimeError(
                    "Speaking audio could not be normalized to WAV/PCM for strict pronunciation scoring. "
                    f"{normalization_warning or 'Uploaded audio format is not supported by the local pronunciation engines.'}"
                )
            analysis_path_for_scoring = analysis_path
            if normalized_tmp_path is not None and normalized_tmp_path != tmp_path:
                cleanup_paths.append(normalized_tmp_path)
            audio_quality = await asyncio.to_thread(
                analyze_wav_audio_quality,
                analysis_path,
                normalization_warning=normalization_warning,
            )
            async with whisper_lock:
                segments, detected_transcript = await asyncio.to_thread(
                    transcribe_audio_file,
                    analysis_path,
                    language="en",
                    word_timestamps=True,
                )
            transcript = detected_transcript or transcript
        except Exception as ex:
            logger.exception("Failed to transcribe speaking audio for answer %s.", answer_id)
            if not transcript:
                transcript = ""
                if audio_quality is None:
                    audio_quality = SpeakingAudioQuality(
                        is_usable=False,
                        label="technical_low_confidence",
                        warnings=[f"ASR could not decode or transcribe the audio: {ex}"],
                    )
                else:
                    audio_quality.warnings.append(f"ASR could not decode or transcribe the audio: {ex}")
                    audio_quality.is_usable = False
                    audio_quality.label = "technical_low_confidence"
    elif not transcript:
        raise ValueError("Audio file or transcript_text is required.")

    if not transcript.strip():
        logger.info(
            "Scoring speaking answer %s as no response because no transcript was detected.",
            answer_id,
        )

    effective_duration_seconds = (
        duration_seconds
        if duration_seconds is not None and duration_seconds > 0
        else audio_quality.duration_seconds if audio_quality is not None else None
    )
    try:
        rubrics, overall_feedback, speaking_evidence = await score_speaking_rubrics(
            transcript,
            answer_id=answer_id,
            question_prompt=question_prompt,
            part_number=part_number,
            prompt_type=prompt_type,
            target_duration_seconds=target_duration_seconds,
            duration_seconds=effective_duration_seconds,
            segments=segments,
            audio_quality=audio_quality,
            audio_path=analysis_path_for_scoring,
            gemini_client=gemini_client,
        )
        overall_band = round_band_half(sum(rubric.band for rubric in rubrics) / len(rubrics))
        logger.info(
            "Speaking scoring result for answer %s: Overall=%s, Criteria=%s",
            answer_id,
            overall_band,
            {r.criteria: r.band for r in rubrics},
        )
        return ScoreResponse(
            session_id=session_id,
            answer_id=answer_id,
            overall_band=overall_band,
            rubrics=rubrics,
            overall_feedback=overall_feedback,
            transcript_text=transcript,
            speaking_evidence=speaking_evidence,
        )
    finally:
        for path in reversed(cleanup_paths):
            try:
                if path and os.path.exists(path):
                    os.unlink(path)
            except OSError:
                pass
