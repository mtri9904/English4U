"""Audio-backed evidence helpers for IELTS-style Speaking scoring."""

from __future__ import annotations

import math

from faster_whisper.transcribe import Segment, Word

from schemas import (
    SpeakingAudioQuality,
    SpeakingPauseStats,
)
from speaking.audio_codec import (
    decode_audio_samples_with_pyav,
    read_wav_pcm_samples,
)


def analyze_wav_audio_quality(file_path: str, *, normalization_warning: str | None = None) -> SpeakingAudioQuality:
    warnings: list[str] = []
    if normalization_warning:
        warnings.append(normalization_warning)

    try:
        samples, sample_rate, channels, duration_seconds, decoded_format = decode_audio_samples_with_pyav(file_path)
    except Exception as ex:
        pyav_error = ex
        try:
            samples, sample_rate, channels, duration_seconds = read_wav_pcm_samples(file_path)
            decoded_format = "wav/pcm/16kHz/mono" if sample_rate == 16000 and channels == 1 else "wav/pcm"
        except Exception as wav_ex:
            warnings.append(f"Audio QA could not decode the audio payload with PyAV ({pyav_error}) or WAV reader ({wav_ex}).")
            return SpeakingAudioQuality(
                is_usable=True,
                label="unknown",
                normalized_audio_format=None,
                warnings=warnings,
            )

    if not samples:
        warnings.append("Audio payload has no readable PCM samples.")
        return SpeakingAudioQuality(
            is_usable=False,
            label="empty",
            duration_seconds=round(duration_seconds, 2),
            sample_rate_hz=sample_rate,
            channels=channels,
            normalized_audio_format="wav/pcm/16kHz/mono" if sample_rate == 16000 and channels == 1 else "wav/pcm",
            warnings=warnings,
        )

    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
    loudness_dbfs = 20 * math.log10(max(rms, 1e-9))
    clipping_ratio = sum(1 for sample in samples if abs(sample) >= 0.98) / len(samples)

    window_size = max(1, int(sample_rate * 0.02))
    window_dbfs_values: list[float] = []
    for index in range(0, len(samples), window_size):
        window = samples[index:index + window_size]
        if not window:
            continue
        window_rms = math.sqrt(sum(sample * sample for sample in window) / len(window))
        window_dbfs_values.append(20 * math.log10(max(window_rms, 1e-9)))

    silence_ratio = (
        sum(1 for dbfs in window_dbfs_values if dbfs < -45.0) / len(window_dbfs_values)
        if window_dbfs_values
        else None
    )
    snr_db: float | None = None
    if len(window_dbfs_values) >= 5:
        sorted_windows = sorted(window_dbfs_values)
        noise_floor = sorted_windows[max(0, int(len(sorted_windows) * 0.1) - 1)]
        snr_db = max(0.0, loudness_dbfs - noise_floor)

    if duration_seconds < 0.8:
        warnings.append("Audio is shorter than 0.8 seconds.")
    if silence_ratio is not None and silence_ratio > 0.9:
        warnings.append("Audio is mostly silence.")
    if loudness_dbfs < -48.0:
        warnings.append("Audio is very quiet.")
    if clipping_ratio > 0.02:
        warnings.append("Audio has clipping above 2%.")
    if snr_db is not None and snr_db < 8.0:
        warnings.append("Estimated SNR is low.")

    is_usable = not (
        duration_seconds < 0.5
        or (silence_ratio is not None and silence_ratio > 0.96)
        or loudness_dbfs < -55.0
    )
    label = "usable"
    if not is_usable:
        label = "technical_low_confidence"
    elif warnings:
        label = "usable_with_warnings"

    return SpeakingAudioQuality(
        is_usable=is_usable,
        label=label,
        duration_seconds=round(duration_seconds, 2),
        sample_rate_hz=sample_rate,
        channels=channels,
        silence_ratio=round(silence_ratio, 3) if silence_ratio is not None else None,
        clipping_ratio=round(clipping_ratio, 4),
        loudness_dbfs=round(loudness_dbfs, 1),
        snr_db=round(snr_db, 1) if snr_db is not None else None,
        normalized_audio_format=decoded_format,
        warnings=warnings,
    )


def flatten_speaking_words(segments: list[Segment]) -> list[Word]:
    return [
        word
        for segment in segments
        for word in (segment.words or [])
        if word.word and word.word.strip()
    ]


def get_speaking_pauses(segments: list[Segment], flat_words: list[Word] | None = None) -> list[float]:
    words = flat_words if flat_words is not None else flatten_speaking_words(segments)
    if words:
        return [
            max(0.0, current.start - previous.end)
            for previous, current in zip(words, words[1:])
            if current.start is not None and previous.end is not None
        ]

    return [
        max(0.0, current.start - previous.end)
        for previous, current in zip(segments, segments[1:])
        if current.start is not None and previous.end is not None
    ]


def build_speaking_pause_stats(pauses: list[float]) -> SpeakingPauseStats:
    counted_pauses = [pause for pause in pauses if pause >= 0.25]
    long_pauses = [pause for pause in pauses if pause >= 1.2]
    total_pause_seconds = sum(counted_pauses)
    return SpeakingPauseStats(
        pause_count=len(counted_pauses),
        long_pause_count=len(long_pauses),
        total_pause_seconds=round(total_pause_seconds, 2),
        average_pause_seconds=round(total_pause_seconds / len(counted_pauses), 2) if counted_pauses else None,
        longest_pause_seconds=round(max(counted_pauses), 2) if counted_pauses else None,
    )


def calculate_speech_ratio(
    segments: list[Segment],
    *,
    duration_seconds: float | None,
    flat_words: list[Word] | None = None,
) -> float | None:
    if not duration_seconds or duration_seconds <= 0:
        return None

    words = flat_words if flat_words is not None else flatten_speaking_words(segments)
    if words:
        speech_seconds = sum(
            max(0.0, word.end - word.start)
            for word in words
            if word.start is not None and word.end is not None
        )
    else:
        speech_seconds = sum(
            max(0.0, segment.end - segment.start)
            for segment in segments
            if segment.start is not None and segment.end is not None
        )

    return round(min(1.0, max(0.0, speech_seconds / duration_seconds)), 3)
