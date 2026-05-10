from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
import wave
from typing import TypeVar

from fastapi import HTTPException
from google.genai import types as google_genai_types
from pydantic import BaseModel

from schemas import StructuredScoreResult
from settings import (
    GEMINI_SCORING_MODEL_CANDIDATES,
    GEMINI_SPEAKING_TTS_MODEL_CANDIDATES,
    GEMINI_SPEAKING_TTS_VOICE,
)


logger = logging.getLogger(__name__)

StructuredModelT = TypeVar("StructuredModelT", bound=BaseModel)


def build_scoring_prompt(text: str, rubrics: list[str], skill_type: str, question_prompt: str | None) -> str:
    rubric_list = "\n".join(f"- {rubric}" for rubric in rubrics)
    context = f"\nQuestion/Topic: {question_prompt}" if question_prompt else ""
    return f"""You are an expert IELTS examiner. Score the following {skill_type} response on the IELTS band scale (0-9, increments of 0.5).
{context}
Student's response:
\"\"\"
{text}
\"\"\"

Score based on these criteria:
{rubric_list}

Return ONLY valid JSON in this exact format:
{{
  "overall_band": <number>,
  "rubrics": [
    {{
      "criteria": "<criteria name>",
      "band": <number>,
      "comment": "<brief feedback in Vietnamese>",
      "improvements": "<specific improvement suggestions in Vietnamese>"
    }}
  ]
}}"""


def generate_structured_content_with_gemini(
    gemini_client: object,
    prompt: str,
    system_instruction: str,
    response_schema: type[StructuredModelT],
    model_candidates: list[str],
    *,
    error_context: str,
    temperature: float = 0.1,
    max_output_tokens: int = 2048,
) -> StructuredModelT:
    if gemini_client is None:
        raise HTTPException(status_code=503, detail="Gemini client is not configured.")

    def parse_structured_text_payload(raw_text: str) -> StructuredModelT:
        text = raw_text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
            text = re.sub(r"\s*```$", "", text).strip()
        try:
            return response_schema.model_validate_json(text)
        except Exception:
            start_index = text.find("{")
            end_index = text.rfind("}")
            if start_index >= 0 and end_index > start_index:
                return response_schema.model_validate_json(text[start_index:end_index + 1])
            raise

    last_error: Exception | None = None
    for model_name in model_candidates:
        try:
            is_gemma_model = model_name.lower().startswith("gemma-")
            config_kwargs = {
                "temperature": temperature,
                "candidate_count": 1,
                "max_output_tokens": max_output_tokens,
            }
            request_contents = prompt
            if is_gemma_model:
                request_contents = (
                    f"{system_instruction.strip()}\n\n"
                    "Return only valid JSON. Do not include markdown fences or explanatory text.\n\n"
                    f"{prompt}"
                )
            else:
                config_kwargs["system_instruction"] = system_instruction
                config_kwargs["response_mime_type"] = "application/json"
                config_kwargs["response_schema"] = response_schema

            response = gemini_client.models.generate_content(
                model=model_name,
                contents=request_contents,
                config=google_genai_types.GenerateContentConfig(**config_kwargs),
            )
            if isinstance(response.parsed, response_schema):
                return response.parsed

            if isinstance(response.text, str) and response.text.strip():
                return parse_structured_text_payload(response.text)

            raise RuntimeError(f"Gemini model {model_name} returned no structured payload.")
        except HTTPException:
            raise
        except Exception as ex:  # pragma: no cover
            last_error = ex
            logger.exception("Gemini model %s failed during %s.", model_name, error_context)

    raise HTTPException(status_code=503, detail=f"Gemini {error_context} failed: {last_error}") from last_error


async def generate_structured_content_with_gemini_async(
    gemini_client: object,
    prompt: str,
    system_instruction: str,
    response_schema: type[StructuredModelT],
    model_candidates: list[str],
    *,
    error_context: str,
    temperature: float = 0.1,
    max_output_tokens: int = 2048,
) -> StructuredModelT:
    return await asyncio.to_thread(
        generate_structured_content_with_gemini,
        gemini_client,
        prompt,
        system_instruction,
        response_schema,
        model_candidates,
        error_context=error_context,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )


def build_speaking_prompt_tts_text(prompt_text: str) -> str:
    normalized_prompt = re.sub(r"\s+", " ", (prompt_text or "").strip())
    if not normalized_prompt:
        raise ValueError("Prompt text is required for speaking TTS.")

    return (
        "Read exactly the following IELTS Speaking examiner prompt in a clear, neutral, professional examiner voice. "
        "Do not add any introductions, explanations, or extra words.\n\n"
        f"{normalized_prompt}"
    )


def pcm_to_wav_bytes(
    pcm_bytes: bytes,
    *,
    channels: int = 1,
    sample_rate: int = 24_000,
    sample_width: int = 2,
) -> bytes:
    with io.BytesIO() as wav_buffer:
        with wave.open(wav_buffer, "wb") as wav_file:
            wav_file.setnchannels(channels)
            wav_file.setsampwidth(sample_width)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(pcm_bytes)
        return wav_buffer.getvalue()


def generate_speaking_prompt_audio_with_gemini(
    gemini_client: object,
    prompt_text: str,
    *,
    voice_name: str | None = None,
) -> bytes:
    if gemini_client is None:
        raise HTTPException(status_code=503, detail="Gemini client is not configured.")

    final_voice_name = (voice_name or GEMINI_SPEAKING_TTS_VOICE).strip() or GEMINI_SPEAKING_TTS_VOICE
    tts_prompt = build_speaking_prompt_tts_text(prompt_text)

    last_error: Exception | None = None
    for model_name in GEMINI_SPEAKING_TTS_MODEL_CANDIDATES:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=tts_prompt,
                config=google_genai_types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=google_genai_types.SpeechConfig(
                        voice_config=google_genai_types.VoiceConfig(
                            prebuilt_voice_config=google_genai_types.PrebuiltVoiceConfig(
                                voice_name=final_voice_name,
                            )
                        )
                    ),
                    candidate_count=1,
                ),
            )

            pcm_bytes: bytes | None = None
            for candidate in response.candidates or []:
                for part in candidate.content.parts or []:
                    inline_data = getattr(part, "inline_data", None)
                    raw_audio = getattr(inline_data, "data", None)
                    if raw_audio is None:
                        continue

                    pcm_bytes = (
                        base64.b64decode(raw_audio)
                        if isinstance(raw_audio, str)
                        else bytes(raw_audio)
                    )
                    break

                if pcm_bytes:
                    break

            if not pcm_bytes:
                raise RuntimeError(f"Gemini TTS model {model_name} returned no audio payload.")

            return pcm_to_wav_bytes(pcm_bytes)
        except HTTPException:
            raise
        except Exception as ex:  # pragma: no cover
            last_error = ex
            logger.exception("Gemini TTS model %s failed for speaking prompt generation.", model_name)

    raise HTTPException(status_code=503, detail=f"Gemini speaking TTS failed: {last_error}") from last_error


async def generate_speaking_prompt_audio_with_gemini_async(
    gemini_client: object,
    prompt_text: str,
    *,
    voice_name: str | None = None,
) -> bytes:
    return await asyncio.to_thread(
        generate_speaking_prompt_audio_with_gemini,
        gemini_client,
        prompt_text,
        voice_name=voice_name,
    )


async def call_scoring_model(gemini_client: object, prompt: str) -> StructuredScoreResult:
    return await generate_structured_content_with_gemini_async(
        gemini_client,
        prompt=prompt,
        system_instruction=(
            "You are an IELTS examiner. Return only valid JSON that matches the requested schema."
        ),
        response_schema=StructuredScoreResult,
        model_candidates=GEMINI_SCORING_MODEL_CANDIDATES,
        error_context="scoring",
        max_output_tokens=2048,
    )
