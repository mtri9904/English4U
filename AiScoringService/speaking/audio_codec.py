from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import wave
from array import array


def write_pcm_samples_to_wav(file_path: str, samples: list[float], *, sample_rate: int = 16000) -> None:
    pcm_values = array(
        "h",
        (
            int(max(-1.0, min(1.0, sample)) * 32767)
            for sample in samples
        ),
    )
    if sys.byteorder == "big":
        pcm_values.byteswap()

    with wave.open(file_path, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_values.tobytes())


def normalize_audio_to_16khz_mono_wav(file_path: str) -> tuple[str, str | None, str | None]:
    ffmpeg_path = shutil.which("ffmpeg")
    output_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    output_path = output_file.name
    output_file.close()

    errors: list[str] = []
    if ffmpeg_path:
        command = [
            ffmpeg_path,
            "-y",
            "-i",
            file_path,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-vn",
            output_path,
        ]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=60)
            return output_path, output_path, None
        except Exception as ex:
            errors.append(f"ffmpeg failed: {ex}")

    try:
        samples, sample_rate, _channels, _duration_seconds, _decoded_format = decode_audio_samples_with_pyav(file_path)
        if not samples:
            raise RuntimeError("decoded audio has no PCM samples")
        write_pcm_samples_to_wav(output_path, samples, sample_rate=sample_rate)
        warning = None
        if not ffmpeg_path:
            warning = "ffmpeg is not available; normalized audio with PyAV."
        elif errors:
            warning = f"ffmpeg normalization failed; normalized audio with PyAV instead ({errors[0]})."
        return output_path, output_path, warning
    except Exception as ex:
        errors.append(f"PyAV WAV normalization failed: {ex}")
        try:
            os.unlink(output_path)
        except OSError:
            pass
        return file_path, None, "Could not normalize audio to 16kHz mono WAV: " + " | ".join(errors)


def is_wav_file_path(file_path: str | None) -> bool:
    return bool(file_path and os.path.splitext(file_path)[1].lower() == ".wav")


def decode_audio_samples_with_pyav(file_path: str) -> tuple[list[float], int, int, float, str]:
    try:
        import av  # type: ignore
    except Exception as ex:
        raise RuntimeError(f"PyAV is not available: {ex}") from ex

    samples: list[float] = []
    source_channels = 1
    with av.open(file_path) as container:
        audio_streams = [stream for stream in container.streams if stream.type == "audio"]
        if not audio_streams:
            raise RuntimeError("No audio stream found.")

        stream = audio_streams[0]
        source_channels = int(getattr(stream.codec_context, "channels", None) or 1)
        resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in container.decode(stream):
            resampled_frames = resampler.resample(frame)
            if resampled_frames is None:
                continue
            if not isinstance(resampled_frames, list):
                resampled_frames = [resampled_frames]

            for resampled_frame in resampled_frames:
                ndarray = resampled_frame.to_ndarray()
                values = ndarray.reshape(-1).tolist()
                samples.extend(max(-1.0, min(1.0, float(value) / 32768.0)) for value in values)

    duration_seconds = len(samples) / 16000 if samples else 0.0
    return samples, 16000, source_channels, duration_seconds, "pyav/pcm/16kHz/mono"


def read_wav_pcm_samples(file_path: str) -> tuple[list[float], int, int, float]:
    with wave.open(file_path, "rb") as wav_file:
        channels = wav_file.getnchannels()
        sample_rate = wav_file.getframerate()
        sample_width = wav_file.getsampwidth()
        frame_count = wav_file.getnframes()
        raw_frames = wav_file.readframes(frame_count)

    duration_seconds = frame_count / sample_rate if sample_rate > 0 else 0.0
    if not raw_frames or sample_rate <= 0:
        return [], sample_rate, channels, duration_seconds

    if sample_width == 2:
        values = array("h")
        values.frombytes(raw_frames)
        if sys.byteorder == "big":
            values.byteswap()
        samples = [max(-1.0, min(1.0, value / 32768.0)) for value in values]
    elif sample_width == 1:
        values = array("B")
        values.frombytes(raw_frames)
        samples = [((value - 128) / 128.0) for value in values]
    elif sample_width == 4:
        values = array("i")
        values.frombytes(raw_frames)
        if sys.byteorder == "big":
            values.byteswap()
        samples = [max(-1.0, min(1.0, value / 2147483648.0)) for value in values]
    else:
        raise ValueError(f"Unsupported WAV sample width: {sample_width} bytes")

    if channels > 1:
        mono_samples = []
        for index in range(0, len(samples), channels):
            frame = samples[index:index + channels]
            if frame:
                mono_samples.append(sum(frame) / len(frame))
        samples = mono_samples

    return samples, sample_rate, channels, duration_seconds
