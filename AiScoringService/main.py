import io
# Trigger config reload to update JSON example template placeholders
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from faster_whisper.transcribe import Segment
try:
    from google import genai as google_genai
except ImportError as ex:
    raise ImportError(
        "Missing google-genai in the active Python environment. "
        "Start AiScoringService with the local venv: "
        r".\venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"
    ) from ex
from gemini_utils import (
    generate_speaking_prompt_audio_with_gemini_async,
)
from listening.service import (
    build_listening_alignment_response,
    build_listening_transcript_response,
)
from settings import (
    GEMINI_API_KEY,
    LISTENING_TRANSCRIPT_WHISPER_MODEL_SIZE,
    WHISPER_MODEL_SIZE,
)
from schemas import (
    GenerateSpeakingPromptAudioRequest,
    ListeningTranscriptAlignmentRequest,
    ListeningTranscriptAlignmentResponse,
    ListeningTranscriptRequest,
    ListeningTranscriptResponse,
    ScoreResponse,
    ScoreSpeakingSessionRequest,
    ScoreSpeakingRequest,
    ScoreWritingRequest,
    ReadabilityAnalysisRequest,
    ReadabilityAnalysisResponse,
)
from readability_utils import analyze_text_readability
from speaking.audio_activity import get_speaking_audio_tool_status
from speaking.service import score_speaking_answer_response
from speaking.session_scoring import score_speaking_session_rubrics
from speaking.pronunciation import get_speaking_pronunciation_tool_status
from writing.service import score_writing_response

speaking_whisper_model: WhisperModel | None = None
listening_whisper_model: WhisperModel | None = None
gemini_client: google_genai.Client | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global speaking_whisper_model, listening_whisper_model, gemini_client
    
    # Copy pre-downloaded MFA models from read-only /code/mfa_models to writable /tmp/mfa at runtime
    if "SPACE_ID" in os.environ:
        import shutil
        src_mfa = "/code/mfa_models"
        dst_mfa = "/tmp/mfa"
        if os.path.exists(src_mfa) and not os.path.exists(os.path.join(dst_mfa, "acoustic")):
            try:
                shutil.copytree(src_mfa, dst_mfa, dirs_exist_ok=True)
            except Exception as e:
                print(f"Error copying MFA models: {e}")

    speaking_whisper_model = WhisperModel(WHISPER_MODEL_SIZE, device="cpu", compute_type="int8")
    listening_whisper_model = WhisperModel(
        LISTENING_TRANSCRIPT_WHISPER_MODEL_SIZE,
        device="cpu",
        compute_type="int8",
    )
    gemini_client = google_genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
    yield
    speaking_whisper_model = None
    listening_whisper_model = None
    gemini_client = None


# v3 - top3 peak capability, no downward clamp, cache cleared
app = FastAPI(title="AI Scoring Service", version="2.0.0", lifespan=lifespan)

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    body = await request.body()
    try:
        body_str = body.decode("utf-8")
    except Exception:
        body_str = str(body)
    
    # Ghi log lỗi ra file để agent đọc
    try:
        import json
        with open("error_debug.txt", "w", encoding="utf-8") as f:
            f.write(f"Errors:\n{json.dumps(exc.errors(), indent=2)}\n\nBody:\n{body_str}")
    except Exception as e:
        print(f"Failed to write error log: {e}")
        
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body_str": body_str},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def transcribe_audio_file_with_model(
    model: WhisperModel | None,
    file_path: str,
    *,
    language: str = "en",
    word_timestamps: bool = False,
) -> tuple[list[Segment], str]:
    if model is None:
        raise RuntimeError("Whisper model not loaded.")

    segments, _ = model.transcribe(
        file_path,
        language=language,
        beam_size=5,
        vad_filter=True,
        word_timestamps=word_timestamps,
    )
    normalized_segments = [
        segment
        for segment in segments
        if segment.text and segment.text.strip()
    ]
    transcript = " ".join(segment.text.strip() for segment in normalized_segments).strip()
    return normalized_segments, transcript


def transcribe_speaking_audio_file(
    file_path: str,
    *,
    language: str = "en",
    word_timestamps: bool = False,
) -> tuple[list[Segment], str]:
    return transcribe_audio_file_with_model(
        speaking_whisper_model,
        file_path,
        language=language,
        word_timestamps=word_timestamps,
    )


def transcribe_listening_audio_file(
    file_path: str,
    *,
    language: str = "en",
    word_timestamps: bool = False,
) -> tuple[list[Segment], str]:
    return transcribe_audio_file_with_model(
        listening_whisper_model,
        file_path,
        language=language,
        word_timestamps=word_timestamps,
    )


@app.post("/api/ai/score-speaking-session", response_model=ScoreResponse)
async def score_speaking_session(request: ScoreSpeakingSessionRequest):
    if not request.answers:
        raise HTTPException(status_code=400, detail="At least one speaking answer is required.")

    final_rubrics, final_feedback, overall_band = await score_speaking_session_rubrics(
        request,
        gemini_client=gemini_client,
    )

    return ScoreResponse(
        session_id=request.session_id,
        answer_id=request.session_id,
        overall_band=overall_band,
        rubrics=final_rubrics,
        overall_feedback=final_feedback,
    )


@app.post("/api/ai/score-writing", response_model=ScoreResponse)
async def score_writing(request: ScoreWritingRequest):
    try:
        return await score_writing_response(request, gemini_client=gemini_client)
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


@app.post("/api/ai/score-speaking", response_model=ScoreResponse)
async def score_speaking(request: ScoreSpeakingRequest):
    try:
        return await score_speaking_answer_response(
            audio=None,
            audio_url=request.audio_url,
            session_id=request.session_id,
            answer_id=request.answer_id,
            question_prompt=request.question_prompt,
            transcript_text=request.transcript_text,
            part_number=request.part_number,
            prompt_type=request.prompt_type,
            target_duration_seconds=request.target_duration_seconds,
            duration_seconds=request.duration_seconds,
            transcribe_audio_file=transcribe_speaking_audio_file,
            whisper_loaded=speaking_whisper_model is not None,
            gemini_client=gemini_client,
        )
    except RuntimeError as ex:
        raise HTTPException(status_code=503, detail=str(ex)) from ex
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


@app.post("/api/ai/generate-speaking-prompt-audio")
async def generate_speaking_prompt_audio(request: GenerateSpeakingPromptAudioRequest):
    prompt_text = (request.promptText or "").strip()
    if not prompt_text:
        raise HTTPException(status_code=400, detail="promptText is required.")

    wav_bytes = await generate_speaking_prompt_audio_with_gemini_async(gemini_client, prompt_text)
    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={
            "Content-Disposition": 'inline; filename="speaking-prompt.wav"',
        },
    )


@app.post("/api/ai/generate-listening-transcript", response_model=ListeningTranscriptResponse)
async def generate_listening_transcript(request: ListeningTranscriptRequest):
    if listening_whisper_model is None:
        raise HTTPException(status_code=503, detail="Whisper model not loaded.")

    try:
        return await build_listening_transcript_response(
            request,
            transcribe_audio_file=transcribe_listening_audio_file,
        )
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


@app.post("/api/ai/align-listening-transcript", response_model=ListeningTranscriptAlignmentResponse)
async def align_listening_transcript(request: ListeningTranscriptAlignmentRequest):
    try:
        return await build_listening_alignment_response(
            request,
        )
    except ValueError as ex:
        raise HTTPException(status_code=400, detail=str(ex)) from ex


@app.post("/api/ai/analyze-readability", response_model=ReadabilityAnalysisResponse)
async def analyze_readability(request: ReadabilityAnalysisRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is empty.")
    try:
        result = analyze_text_readability(request.text)
        return ReadabilityAnalysisResponse(**result)
    except Exception as ex:
        raise HTTPException(status_code=500, detail=str(ex)) from ex


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "whisper_loaded": speaking_whisper_model is not None and listening_whisper_model is not None,
        "speaking_whisper_loaded": speaking_whisper_model is not None,
        "listening_whisper_loaded": listening_whisper_model is not None,
        "speaking_audio": get_speaking_audio_tool_status(),
        "speaking_pronunciation": get_speaking_pronunciation_tool_status(),
    }
