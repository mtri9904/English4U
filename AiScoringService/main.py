import asyncio
import base64
import importlib.util
import io
import json
import logging
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import wave
from array import array
from collections import Counter
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Literal, TypeVar
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from docling.document_converter import DocumentConverter
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from faster_whisper.transcribe import Segment, Word
from google import genai as google_genai
from google.genai import types as google_genai_types
from pdf_parser import OPTION_REQUIRED_TYPES, ParsedOption, parse_ielts_pdf, parsed_passage_to_group
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

load_dotenv()


def parse_env_bool(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def parse_env_float(name: str, default: float, *, minimum: float | None = None) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = float(raw_value)
    except ValueError:
        return default
    if minimum is not None:
        value = max(minimum, value)
    return value


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_SCORING_MODEL = os.getenv("GEMINI_SCORING_MODEL", "gemini-2.5-flash-lite").strip()
GEMINI_SCORING_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_SCORING_FALLBACK_MODELS", "gemini-2.5-flash").split(",")
    if model.strip()
]
GEMINI_SCORING_MODEL_CANDIDATES = list(
    dict.fromkeys([
        model
        for model in [GEMINI_SCORING_MODEL, *GEMINI_SCORING_FALLBACK_MODELS]
        if model
    ])
)
GEMINI_SPEAKING_TTS_MODEL = os.getenv("GEMINI_SPEAKING_TTS_MODEL", "gemini-3.1-flash-tts").strip()
GEMINI_SPEAKING_TTS_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_SPEAKING_TTS_FALLBACK_MODELS", "gemini-2.5-flash-tts,gemini-2.5-pro-tts").split(",")
    if model.strip()
]
GEMINI_SPEAKING_TTS_MODEL_CANDIDATES = list(
    dict.fromkeys([
        model
        for model in [GEMINI_SPEAKING_TTS_MODEL, *GEMINI_SPEAKING_TTS_FALLBACK_MODELS]
        if model
    ])
)
GEMINI_SPEAKING_TTS_VOICE = os.getenv("GEMINI_SPEAKING_TTS_VOICE", "Iapetus").strip() or "Iapetus"
GEMINI_SPEAKING_SCORING_MODEL = os.getenv("GEMINI_SPEAKING_SCORING_MODEL", "gemma-3-27b-it").strip()
GEMINI_SPEAKING_SCORING_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_SPEAKING_SCORING_FALLBACK_MODELS", "gemma-3-12b-it,gemma-3-4b-it,gemma-3-1b-it").split(",")
    if model.strip()
]
GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES = list(
    dict.fromkeys([
        model
        for model in [GEMINI_SPEAKING_SCORING_MODEL, *GEMINI_SPEAKING_SCORING_FALLBACK_MODELS]
        if model
    ])
)
GEMINI_ALIGNMENT_MODEL = os.getenv("GEMINI_ALIGNMENT_MODEL", "gemini-2.5-flash").strip()
LISTENING_ALIGNMENT_USE_GEMINI = os.getenv("LISTENING_ALIGNMENT_USE_GEMINI", "false").strip().lower() in {"1", "true", "yes", "on"}
GEMINI_ALIGNMENT_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_ALIGNMENT_FALLBACK_MODELS", "").split(",")
    if model.strip()
]
GEMINI_ALIGNMENT_MODEL_CANDIDATES = list(
    dict.fromkeys([
        model
        for model in [GEMINI_ALIGNMENT_MODEL, *GEMINI_ALIGNMENT_FALLBACK_MODELS]
        if model
    ])
)
LANGUAGETOOL_ENABLED = os.getenv("LANGUAGETOOL_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
LANGUAGETOOL_URL = os.getenv("LANGUAGETOOL_URL", "http://localhost:8081/v2/check").strip()
LANGUAGETOOL_LANGUAGE = os.getenv("LANGUAGETOOL_LANGUAGE", "en-US").strip() or "en-US"
try:
    LANGUAGETOOL_TIMEOUT_SECONDS = max(0.2, float(os.getenv("LANGUAGETOOL_TIMEOUT_SECONDS", "2.0")))
except ValueError:
    LANGUAGETOOL_TIMEOUT_SECONDS = 2.0
LANGUAGETOOL_UNAVAILABLE_COOLDOWN_SECONDS = 60.0

SPEAKING_PRONUNCIATION_ENGINE = os.getenv("SPEAKING_PRONUNCIATION_ENGINE", "mfa_praat_allosaurus").strip().lower() or "mfa_praat_allosaurus"
SPEAKING_PRONUNCIATION_STRICT = parse_env_bool("SPEAKING_PRONUNCIATION_STRICT", True)
SPEAKING_ENABLE_PRAAT = parse_env_bool("SPEAKING_ENABLE_PRAAT", True)
SPEAKING_ENABLE_MFA = parse_env_bool("SPEAKING_ENABLE_MFA", True)
SPEAKING_MFA_BINARY = os.getenv("SPEAKING_MFA_BINARY", "mfa").strip() or "mfa"
SPEAKING_MFA_DICTIONARY_PATH = os.getenv("SPEAKING_MFA_DICTIONARY_PATH", "english_mfa").strip()
SPEAKING_MFA_ACOUSTIC_MODEL_PATH = os.getenv("SPEAKING_MFA_ACOUSTIC_MODEL_PATH", "english_mfa").strip()
SPEAKING_ENABLE_ALLOSAURUS = parse_env_bool("SPEAKING_ENABLE_ALLOSAURUS", True)
SPEAKING_ALLOSAURUS_MODEL = os.getenv("SPEAKING_ALLOSAURUS_MODEL", "eng2102").strip() or "eng2102"
SPEAKING_ALLOSAURUS_LANG = os.getenv("SPEAKING_ALLOSAURUS_LANG", "eng").strip() or "eng"
SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS = parse_env_float(
    "SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS", 90.0, minimum=5.0
)
SPEAKING_PITCH_FLOOR_HZ = parse_env_float("SPEAKING_PITCH_FLOOR_HZ", 75.0, minimum=20.0)
SPEAKING_PITCH_CEILING_HZ = parse_env_float("SPEAKING_PITCH_CEILING_HZ", 500.0, minimum=80.0)
SPEAKING_PHONE_MATCH_THRESHOLD = parse_env_float("SPEAKING_PHONE_MATCH_THRESHOLD", 0.45, minimum=0.0)

whisper_model: WhisperModel | None = None
gemini_client: google_genai.Client | None = None
gemini_alignment_quota_cooldown_until = 0.0
languagetool_unavailable_until = 0.0
allosaurus_recognizer_cache: dict[str, object] = {}

StructuredModelT = TypeVar("StructuredModelT", bound=BaseModel)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model, gemini_client
    model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
    whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
    gemini_client = google_genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
    yield
    whisper_model = None
    gemini_client = None


app = FastAPI(title="AI Scoring Service", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ReadingQuestionType = Literal[
    "MCQ_SINGLE",
    "MCQ_MULTIPLE",
    "TFNG",
    "YNNG",
    "MATCHING_HEADINGS",
    "MATCHING_INFO",
    "MATCHING_FEATURES",
    "SENTENCE_COMPLETION",
    "SUMMARY_COMPLETION",
    "TABLE_COMPLETION",
    "FLOWCHART_COMPLETION",
    "SHORT_ANSWER",
]


class ReadingOption(BaseModel):
    optionText: str = Field(description="Nội dung lựa chọn (VD: 'A', 'B', 'TRUE', 'FALSE', 'Paragraph A', 'Heading i')")
    isCorrect: bool = Field(description="true nếu đây là đáp án đúng, false nếu sai")


class ReadingQuestion(BaseModel):
    questionType: ReadingQuestionType = Field(description="Phân loại câu hỏi vào đúng 1 trong 12 dạng IELTS quy định")
    content: str = Field(description="Nội dung câu hỏi chính xác từ file gốc. KHÔNG được tự bịa thêm câu hỏi. Với dạng ĐIỀN TỪ, dùng ___ cho chỗ trống.")
    explanation: str | None = Field(default=None, description="Giải thích đáp án, trích dẫn từ passage")
    correctAnswer: str | None = Field(default=None, description="Dùng cho dạng ĐIỀN TỪ. Tìm đáp án trong phần 'Solution/Answer' ở cuối file. Với TRẮC NGHIỆM và NỐI thì để null (dùng isCorrect trong options).")
    options: list[ReadingOption] | None = Field(default=None, description="Danh sách lựa chọn. Với TFNG: 3 options TRUE/FALSE/NOT GIVEN. Với MCQ: 4 options A/B/C/D. Với ĐIỀN TỪ: mảng rỗng [].")


class ReadingQuestionGroup(BaseModel):
    title: str = Field(description="Tiêu đề ngắn gọn của bài đọc, VD: 'The History of Glass'")
    content: str = Field(description="ĐÂY LÀ BÀI ĐỌC DÀI (PASSAGE). Phải trích xuất TRỌN VẸN toàn bộ nội dung bài đọc. TUYỆT ĐỐI KHÔNG nhét câu hỏi, hướng dẫn làm bài, hoặc câu chỉ dẫn vào đây. Chỉ chứa nội dung passage thuần túy.")
    questions: list[ReadingQuestion] = Field(description="Danh sách câu hỏi thuộc bài đọc này. CHỈ trích xuất câu hỏi có trong file, KHÔNG tự bịa thêm.")


class ReadingExamSection(BaseModel):
    skillType: Literal["Reading"] = Field(default="Reading")
    title: str = Field(description="Tiêu đề section, VD: 'Reading Section'")
    groups: list[ReadingQuestionGroup] = Field(description="Mỗi group = 1 passage + các câu hỏi đi kèm")


class ReadingExam(BaseModel):
    title: str = Field(description="Tiêu đề đề thi")
    description: str = Field(description="Mô tả ngắn gọn")
    examType: str = Field(default="IELTS")
    sections: list[ReadingExamSection] = Field(description="Danh sách sections")


READING_SYSTEM_PROMPT = """Bạn là chuyên gia trích xuất dữ liệu IELTS Reading từ văn bản Markdown.

NHIỆM VỤ SINH TỬ:
1. KHÔNG BAO GIỜ TỰ BỊA CÂU HỎI. Chỉ trích xuất đúng các câu hỏi có trong văn bản gốc.
2. BÀI ĐỌC (PASSAGE): Phải được đưa TRỌN VẸN vào trường `content` của `QuestionGroup`. Tuyệt đối KHÔNG nhét câu hỏi, hướng dẫn làm bài, hoặc câu chỉ dẫn vào `content`.
3. ĐÁP ÁN (SOLUTION/ANSWER): Cuộn xuống CUỐI văn bản, tìm phần 'Solution', 'Answer Key', 'Answers', 'Key'. Trích xuất đáp án chính xác và điền vào từng câu hỏi tương ứng. Nếu KHÔNG có phần Solution, bạn mới được phép tự suy luận đáp án.
4. PHÂN LOẠI: Mỗi câu hỏi phải được phân loại CHÍNH XÁC vào 1 trong 12 dạng quy định.

ÉP KHUÔN 5 NHÓM CÂU HỎI (BẮT BUỘC 100%):

NHÓM 1 - SINGLE CHOICE (MCQ_SINGLE, TFNG, YNNG):
- options: Danh sách lựa chọn, isCorrect=true cho đáp án đúng duy nhất.
- TFNG: ĐÚNG 3 options [TRUE, FALSE, NOT GIVEN]. YNNG: ĐÚNG 3 options [YES, NO, NOT GIVEN]. MCQ_SINGLE: 4 options.
- correctAnswer: null.

NHÓM 2 - MULTI CHOICE (MCQ_MULTIPLE):
- options: Nhiều lựa chọn, NHIỀU isCorrect=true (ít nhất 2).
- correctAnswer: null.

NHÓM 3 - MATCHING (MATCHING_HEADINGS, MATCHING_INFO, MATCHING_FEATURES):
- Mỗi statement = 1 câu hỏi ĐỘC LẬP.
- content: Nội dung cần nối.
- options: Danh sách đích đến. isCorrect=true cho đích đúng.
- correctAnswer: null.

NHÓM 4 - FILL BLANK (SENTENCE_COMPLETION, TABLE_COMPLETION, FLOWCHART_COMPLETION, SHORT_ANSWER):
- options: MẢNG RỖNG [].
- content: Câu hỏi có ___ (trừ SHORT_ANSWER).
- correctAnswer: BẮT BUỘC có dữ liệu. Dùng | cho nhiều đáp án.

NHÓM 5 - SUMMARY COMPLETION (SUMMARY_COMPLETION):
- Tương tự nhóm 4. options có thể chứa Word Box (tất cả isCorrect=false).
- correctAnswer: BẮT BUỘC có dữ liệu.

QUY TẮC LỌC RÁC (BỎ QUA KHÔNG ĐƯA VÀO JSON):
- Trang bìa, mục lục, hướng dẫn sử dụng.
- Hướng dẫn làm bài, định nghĩa True/False/NG.
- Footer/Header, số trang, URL, bản quyền."""

GARBAGE_LINE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(?i)^\s*(https?://|www\.).*$"),
    re.compile(r"(?i).*https?://\S+.*for\s+more\s+practice.*$"),
    re.compile(r"(?i)^\s*access\s+https?://.*$"),

    re.compile(r"(?i)^\s*HOW\s+TO\s+USE.*$"),
    re.compile(r"(?i)^\s*scan\s*(this)?\s*qr\s*code.*$"),
    re.compile(r"(?i)^\s*open\s*(this)?\s*url.*$"),
    re.compile(r"(?i)^\s*mobile\s+device.*$"),
    re.compile(r"(?i)^\s*download\s+(the\s+)?app.*$"),
    re.compile(r"(?i)^\s*visit\s+(our\s+)?(website|site).*$"),

    re.compile(r"(?i)^\s*you\s+should\s+spend\s+about\s+\d+\s+minutes.*$"),
    re.compile(r"(?i)^\s*write\s+(the\s+)?corresponding\s+letter.*$"),
    re.compile(r"(?i)^\s*write\s+your\s+answers?\s+in\s+box(es)?.*$"),
    re.compile(r"(?i)^\s*choose\s+the\s+correct\s+(letter|answer).*$"),
    re.compile(r"(?i)^\s*do\s+the\s+following\s+statements?\s+agree.*$"),
    re.compile(r"(?i)^\s*complete\s+the\s+(following\s+)?(sentences?|summary|table|notes?).*$"),
    re.compile(r"(?i)^\s*classify\s+the\s+following.*$"),
    re.compile(r"(?i)^\s*look\s+at\s+the\s+following.*$"),
    re.compile(r"(?i)^\s*match\s+each\s+.*with\s+the\s+correct.*$"),
    re.compile(r"(?i)^\s*which\s+paragraph\s+contains.*$"),
    re.compile(r"(?i)^\s*reading\s+passage\s+\d+\s+has\s+\d+.*$"),
    re.compile(r"(?i)^\s*NB\s+you\s+may\s+use\s+any\s+letter\s+more\s+than\s+once.*$"),
    re.compile(r"(?i)^\s*use\s+(NO\s+MORE\s+THAN|ONE|TWO|THREE)\s+(ONE|TWO|THREE)?\s*WORDS?.*$"),

    re.compile(r"(?i)^\s*TRUE\s+if\s+the\s+statement\s+agrees.*$"),
    re.compile(r"(?i)^\s*FALSE\s+if\s+the\s+statement.*$"),
    re.compile(r"(?i)^\s*NOT\s+GIVEN\s+if\s+there\s+is\s+no.*$"),
    re.compile(r"(?i)^\s*YES\s+if\s+the\s+statement\s+agrees.*$"),
    re.compile(r"(?i)^\s*NO\s+if\s+the\s+statement\s+contradicts.*$"),

    re.compile(r"(?i)^\s*practice\s+test\s+\d+\s*$"),
    re.compile(r"(?i)^\s*ielts\s+(mock\s+)?test\s*\d*\s*$"),
    re.compile(r"(?i)^\s*test\s+\d+\s*$"),
    re.compile(r"(?i)^\s*ielts\s+(academic\s+)?reading\s*$"),
    re.compile(r"(?i)^\s*reading\s+test\s*\d*\s*$"),
    re.compile(r"(?i)^\s*general\s+training\s*$"),
    re.compile(r"(?i)^\s*academic\s+reading\s*$"),
    re.compile(r"(?i)^\s*reading\s+practice\s+test\s*\d*\s*$"),

    re.compile(r"(?i)^\s*page\s+\d+.*$"),
    re.compile(r"(?i)^\s*p\.\s*\d+\s*$"),
    re.compile(r"(?i)^\s*\d+\s*$"),
    re.compile(r"(?i)^\s*\d+\s*/\s*\d+\s*$"),

    re.compile(r"(?i)^\s*©.*$"),
    re.compile(r"(?i)^\s*copyright.*$"),
    re.compile(r"(?i)^\s*all\s+rights\s+reserved.*$"),

    re.compile(r"(?i)^\s*-{3,}\s*$"),
    re.compile(r"(?i)^\s*_{3,}\s*$"),
    re.compile(r"(?i)^\s*={3,}\s*$"),
    re.compile(r"(?i)^\s*\*{3,}\s*$"),
    re.compile(r"(?i)^\s*\[.*\]\s*$"),
    re.compile(r"(?i)^\s*turn\s+over\s*$"),
    re.compile(r"(?i)^\s*(continued\s+on\s+next|see\s+next)\s+page\s*$"),
    re.compile(r"(?i)^\s*prepared\s+by.*$"),
    re.compile(r"(?i)^\s*downloaded?\s+(from|at|by).*$"),
    re.compile(r"(?i)^\s*source\s*:.*$"),
    re.compile(r"(?i)^\s*this\s+(page|document)\s+(is|has).*$"),
    re.compile(r"(?i)^\s*for\s+more\s+(information|details|practice).*$"),
    re.compile(r"(?i)^\s*subscribe\s+to.*$"),
    re.compile(r"(?i)^\s*follow\s+us\s+on.*$"),
    re.compile(r"(?i)^\s*#\s*$"),

    re.compile(r"(?i)^\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s*\d*\s*$"),
    re.compile(r"(?i)^\s*you\s+have\s+\d+\s+ways?\s+to\s+access.*$"),
    re.compile(r"(?i)^\s*on\s+your\s+answer\s+sheet.*$"),
    re.compile(r"(?i)^\s*questions?\s+\d+\s*[-–to]+\s*\d+\s*$"),
]


def clean_garbage_text(text: str) -> str:
    lines = text.split("\n")
    cleaned: list[str] = []

    for line in lines:
        stripped = line.strip()

        if not stripped:
            cleaned.append("")
            continue

        is_garbage = False
        for pattern in GARBAGE_LINE_PATTERNS:
            if pattern.match(stripped):
                is_garbage = True
                break

        if is_garbage:
            continue

        cleaned.append(line)

    result = "\n".join(cleaned)
    result = re.sub(r"\n{4,}", "\n\n\n", result)
    return result.strip()


def convert_pdf_to_markdown(file_path: str) -> str:
    converter = DocumentConverter()
    result = converter.convert(file_path)
    return result.document.export_to_markdown()


def generate_reading_exam_from_markdown(markdown_text: str) -> ReadingExam:
    cleaned_text = clean_garbage_text(markdown_text)
    return generate_structured_content_with_gemini(
        prompt=cleaned_text,
        system_instruction=READING_SYSTEM_PROMPT,
        response_schema=ReadingExam,
        model_candidates=GEMINI_SCORING_MODEL_CANDIDATES,
        error_context="reading exam generation",
        max_output_tokens=8192,
    )


@app.post("/api/ai/generate-reading-exam")
async def generate_reading_exam(file: UploadFile = File(...)):
    raise HTTPException(
        status_code=410,
        detail="PDF exam generation has been disabled.",
    )




class ScoreWritingRequest(BaseModel):
    session_id: str
    answer_id: str
    essay_text: str
    question_prompt: str | None = None
    skill_type: str = "Writing"


class RubricScore(BaseModel):
    criteria: str
    band: float
    comment: str
    improvements: str
    confidence: float | None = None
    evidence: list[str] = Field(default_factory=list)


class SpeakingWordTimestamp(BaseModel):
    word: str
    start: float | None = None
    end: float | None = None
    probability: float | None = None


class SpeakingPauseStats(BaseModel):
    pause_count: int = 0
    long_pause_count: int = 0
    total_pause_seconds: float = 0.0
    average_pause_seconds: float | None = None
    longest_pause_seconds: float | None = None


class SpeakingAudioQuality(BaseModel):
    is_usable: bool = True
    label: str = "unknown"
    duration_seconds: float | None = None
    sample_rate_hz: int | None = None
    channels: int | None = None
    silence_ratio: float | None = None
    clipping_ratio: float | None = None
    loudness_dbfs: float | None = None
    snr_db: float | None = None
    normalized_audio_format: str | None = None
    warnings: list[str] = Field(default_factory=list)


class SpeakingGrammarIssue(BaseModel):
    rule_id: str | None = None
    category: str | None = None
    issue_type: str | None = None
    message: str
    matched_text: str | None = None
    offset: int | None = None
    length: int | None = None
    replacements: list[str] = Field(default_factory=list)
    weight: float = 1.0


class SpeakingGrammarAnalysis(BaseModel):
    engine: str = "languagetool_http"
    language: str = "en-US"
    is_available: bool = False
    error_count: int = 0
    weighted_error_count: float = 0.0
    error_density_per_100_words: float = 0.0
    category_counts: dict[str, int] = Field(default_factory=dict)
    issues: list[SpeakingGrammarIssue] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SpeakingPronunciationIssue(BaseModel):
    word: str
    expected_phoneme: str | None = None
    actual_phoneme: str | None = None
    is_correct: bool | None = None
    confidence: float | None = None
    start: float | None = None
    end: float | None = None
    issue_type: str | None = None


class SpeakingPronunciationAnalysis(BaseModel):
    engine: str = "asr_word_timing_phoneme_proxy_v2"
    has_word_timing: bool = False
    has_phoneme_alignment: bool = False
    has_pitch_analysis: bool = False
    has_actual_phone_recognition: bool = False
    actual_phone_source: str | None = None
    alignment_source: str | None = None
    acoustic_source: str | None = None
    issue_count: int = 0
    pronunciation_risk_ratio: float = 0.0
    rhythm_score: float | None = None
    stress_score: float | None = None
    intonation_score: float | None = None
    chunking_score: float | None = None
    pitch_mean_hz: float | None = None
    pitch_range_hz: float | None = None
    pitch_variation_score: float | None = None
    phone_match_score: float | None = None
    issues: list[SpeakingPronunciationIssue] = Field(default_factory=list)
    engine_warnings: list[str] = Field(default_factory=list)


class SpeakingEvidence(BaseModel):
    evidence_version: str = "speaking-evidence-v2"
    prompt_type: str | None = None
    target_duration_seconds: float | None = None
    pronunciation_engine: str = "asr_word_timing_phoneme_proxy_v2"
    has_word_timing: bool = False
    has_phoneme_alignment: bool = False
    grammar_analysis: SpeakingGrammarAnalysis | None = None
    pronunciation_analysis: SpeakingPronunciationAnalysis | None = None
    audio_quality: SpeakingAudioQuality | None = None
    asr_confidence: float | None = None
    speech_ratio: float | None = None
    pause_stats: SpeakingPauseStats | None = None
    word_timestamps: list[SpeakingWordTimestamp] = Field(default_factory=list)
    low_confidence_words: list[SpeakingWordTimestamp] = Field(default_factory=list)
    scoring_notes: list[str] = Field(default_factory=list)


class ScoreResponse(BaseModel):
    session_id: str
    answer_id: str
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None
    transcript_text: str | None = None
    speaking_evidence: SpeakingEvidence | None = None


class StructuredScoreResult(BaseModel):
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None


class StructuredSpeakingGeminiResult(BaseModel):
    rubrics: list[RubricScore]


class SpeakingSessionRubricInput(BaseModel):
    criteria: str
    band: float
    comment: str | None = None
    improvements: str | None = None
    confidence: float | None = None
    evidence: list[str] = Field(default_factory=list)


class SpeakingSessionAnswerInput(BaseModel):
    answer_id: str
    question_prompt: str | None = None
    transcript_text: str | None = None
    part_number: int | None = None
    prompt_type: str | None = None
    duration_seconds: float | None = None
    target_duration_seconds: float | None = None
    rubrics: list[SpeakingSessionRubricInput] = Field(default_factory=list)
    no_response: bool = False


class ScoreSpeakingSessionRequest(BaseModel):
    session_id: str
    answers: list[SpeakingSessionAnswerInput] = Field(default_factory=list)


class StructuredSpeakingSessionResult(BaseModel):
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None


class GenerateSpeakingPromptAudioRequest(BaseModel):
    promptText: str


class ListeningTranscriptRequest(BaseModel):
    audio_url: str
    language: str | None = "en"


class ListeningTranscriptSegment(BaseModel):
    start_time: float
    end_time: float | None = None
    text: str


class ListeningTranscriptResponse(BaseModel):
    segments: list[ListeningTranscriptSegment]
    transcript_text: str


class ListeningAlignmentQuestion(BaseModel):
    question_number: int
    question_text: str | None = None
    correct_answer: str | None = None
    correct_option_texts: list[str] = Field(default_factory=list)
    context_text: str | None = None
    group_type: str | None = None


class ListeningTranscriptAlignmentRequest(BaseModel):
    transcript_segments: list[ListeningTranscriptSegment]
    questions: list[ListeningAlignmentQuestion]


class ListeningTranscriptQuestionAlignment(BaseModel):
    question_number: int
    segment_indexes: list[int] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] | None = None


class ListeningTranscriptAlignmentResponse(BaseModel):
    alignments: list[ListeningTranscriptQuestionAlignment]


class ListeningAlignmentSelection(BaseModel):
    question_number: int
    candidate_id: int | None = None
    confidence: Literal["high", "medium", "low"] | None = None


class ListeningAlignmentSelectionBatch(BaseModel):
    selections: list[ListeningAlignmentSelection]


class GeminiAlignmentQuotaExhaustedError(RuntimeError):
    pass


MAP_LOCATION_CUE_PHRASES = [
    "you ll see",
    "you can see",
    "if you want to go to",
    "walk along",
    "you ll come to",
    "the last thing to mention is",
    "there s a covered picnic",
    "there s one near",
    "if you take the side path",
    "cross the bridge",
    "that goes to the house",
    "the building was originally",
]

MAP_LOCATION_TOKENS = {
    "maze",
    "cafe",
    "barn",
    "house",
    "bridge",
    "picnic",
    "scarecrow",
    "path",
    "field",
    "yard",
    "pool",
    "car",
    "park",
    "schoolhouse",
    "workshop",
    "workshops",
    "farmyard",
}


ALIGNMENT_STOPWORDS = {
    "the", "and", "that", "this", "with", "from", "into", "your", "their", "there", "about", "would", "could",
    "should", "have", "has", "had", "were", "was", "been", "being", "while", "where", "when", "which", "what",
    "then", "than", "them", "they", "those", "these", "just", "also", "only", "more", "most", "very",
    "much", "many", "some", "such", "over", "under", "after", "before", "because", "through", "during", "between",
    "each", "other", "another", "into", "onto", "upon", "across", "around", "within", "without", "against", "among",
    "student", "students", "answer", "question", "questions", "listening", "part", "section",
}

ALIGNMENT_INTRO_PHRASES = [
    "i ll tell you something about",
    "let s look at",
    "a word about",
    "before you hear",
    "now listen",
    "listen carefully",
    "you will hear",
    "first you have some time",
    "you have some time to look at",
    "now turn to section",
    "that is the end of section",
    "you now have half a minute",
    "hi great to see you",
    "i m jodi",
    "i ll be looking after both of you",
]

QUESTION_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "twentyone": 21,
    "twentytwo": 22,
    "twentythree": 23,
    "twentyfour": 24,
    "twentyfive": 25,
    "twentysix": 26,
    "twentyseven": 27,
    "twentyeight": 28,
    "twentynine": 29,
    "thirty": 30,
    "thirtyone": 31,
    "thirtytwo": 32,
    "thirtythree": 33,
    "thirtyfour": 34,
    "thirtyfive": 35,
    "thirtysix": 36,
    "thirtyseven": 37,
    "thirtyeight": 38,
    "thirtynine": 39,
    "forty": 40,
}

SECTION_NUMBER_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
}

LISTENING_SECTION_TRANSITION_MARKERS = {
    2: [
        "now turn to section two",
        "turn to section two",
        "now turn to section 2",
        "turn to section 2",
    ],
    3: [
        "now turn to section three",
        "turn to section three",
        "now turn to section 3",
        "turn to section 3",
    ],
    4: [
        "now turn to section four",
        "turn to section four",
        "now turn to section 4",
        "turn to section 4",
    ],
}


def normalize_alignment_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    normalized = normalized.lower()
    normalized = re.sub(r"[^a-z0-9.%/$&+' -]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def build_alignment_token_variants(token: str) -> set[str]:
    normalized = normalize_alignment_text(token)
    if not normalized or " " in normalized:
        return set()

    variants = {normalized}

    if normalized.endswith("ies") and len(normalized) > 4:
        variants.add(normalized[:-3] + "y")

    if normalized.endswith("ments") and len(normalized) > 7:
        variants.add(normalized[:-5])
        variants.add(normalized[:-1])

    if normalized.endswith("ment") and len(normalized) > 6:
        variants.add(normalized[:-4])

    if normalized.endswith("ing") and len(normalized) > 5:
        stem = normalized[:-3]
        variants.add(stem)
        variants.add(stem + "e")

    if normalized.endswith("ed") and len(normalized) > 4:
        stem = normalized[:-2]
        variants.add(stem)
        variants.add(stem + "e")

    if normalized.endswith("es") and len(normalized) > 4:
        variants.add(normalized[:-2])

    if normalized.endswith("s") and len(normalized) > 3:
        variants.add(normalized[:-1])

    return {variant for variant in variants if len(variant) >= 2}


def extract_alignment_tokens(text: str | None) -> set[str]:
    normalized = normalize_alignment_text(text)
    if not normalized:
        return set()

    tokens: set[str] = set()
    for token in normalized.split(" "):
        if not token:
            continue
        tokens.update(build_alignment_token_variants(token))

    return tokens


def parse_question_number_token(token: str | None) -> int | None:
    cleaned = re.sub(r"[^a-z0-9]", "", (token or "").lower())
    if not cleaned:
        return None

    if cleaned.isdigit():
        return int(cleaned)

    return QUESTION_NUMBER_WORDS.get(cleaned)


def parse_number_phrase_token(token: str | None) -> int | None:
    cleaned = normalize_alignment_text(token)
    if not cleaned:
        return None

    direct = parse_question_number_token(cleaned)
    if direct is not None:
        return direct

    compact = re.sub(r"[^a-z0-9]", "", cleaned)
    return parse_question_number_token(compact)


def extract_question_range_from_text(text: str | None) -> tuple[int, int] | None:
    normalized = normalize_alignment_text(text)
    if not normalized:
        return None

    match = re.search(
        r"\bquestions?\s+([a-z0-9 -]+?)\s*(?:to|-)\s*([a-z0-9 -]+)\b",
        normalized,
    )
    if not match:
        return None

    start_question = parse_number_phrase_token(match.group(1))
    end_question = parse_number_phrase_token(match.group(2))
    if start_question is None or end_question is None or start_question > end_question:
        return None

    return start_question, end_question


def extract_section_number_from_text(text: str | None) -> int | None:
    normalized = normalize_alignment_text(text)
    if not normalized:
        return None

    match = re.search(r"\bsection\s+([a-z0-9 -]+)\b", normalized)
    if not match:
        return None

    token = match.group(1).strip()
    compact = re.sub(r"\s+", " ", token)
    if compact in SECTION_NUMBER_WORDS:
        return SECTION_NUMBER_WORDS[compact]

    parsed = parse_number_phrase_token(compact)
    if parsed is None or parsed < 1 or parsed > 4:
        return None

    return parsed


def detect_question_range_scopes(segments: list[ListeningTranscriptSegment]) -> list[dict]:
    raw_events: list[tuple[int, int, int]] = []

    for segment_index, segment in enumerate(segments):
        question_range = extract_question_range_from_text(segment.text)
        if question_range is None:
            continue

        raw_events.append((segment_index, question_range[0], question_range[1]))

    if not raw_events:
        return []

    compressed_events: list[tuple[int, int, int]] = []
    for event in raw_events:
        if compressed_events and compressed_events[-1][1:] == event[1:]:
            compressed_events[-1] = event
            continue

        compressed_events.append(event)

    scopes: list[dict] = []
    for index, (segment_index, start_question, end_question) in enumerate(compressed_events):
        next_segment_index = compressed_events[index + 1][0] if index + 1 < len(compressed_events) else len(segments)
        start_segment_index = min(segment_index + 1, len(segments) - 1)
        end_segment_index = min(
            len(segments) - 1,
            max(start_segment_index, next_segment_index - 1),
        )
        scopes.append({
            "start_question": start_question,
            "end_question": end_question,
            "start_segment_index": start_segment_index,
            "end_segment_index": end_segment_index,
        })

    return scopes


def detect_section_scopes(segments: list[ListeningTranscriptSegment]) -> list[dict]:
    raw_events: list[tuple[int, int]] = []

    for segment_index, segment in enumerate(segments):
        section_number = extract_section_number_from_text(segment.text)
        if section_number is None:
            continue

        raw_events.append((segment_index, section_number))

    if not raw_events:
        return []

    compressed_events: list[tuple[int, int]] = []
    for event in raw_events:
        if compressed_events and compressed_events[-1][1] == event[1]:
            compressed_events[-1] = event
            continue

        compressed_events.append(event)

    scopes: list[dict] = []
    for index, (segment_index, section_number) in enumerate(compressed_events):
        next_segment_index = compressed_events[index + 1][0] if index + 1 < len(compressed_events) else len(segments)
        start_segment_index = min(segment_index + 1, len(segments) - 1)
        end_segment_index = min(
            len(segments) - 1,
            max(start_segment_index, next_segment_index - 1),
        )
        scopes.append({
            "section_number": section_number,
            "start_segment_index": start_segment_index,
            "end_segment_index": end_segment_index,
        })

    return scopes


def find_scope_for_question(question_number: int, scopes: list[dict]) -> tuple[int, int] | None:
    for scope in scopes:
        if scope["start_question"] <= question_number <= scope["end_question"]:
            return scope["start_segment_index"], scope["end_segment_index"]

    return None


def find_section_scope_for_question(question_number: int, scopes: list[dict]) -> tuple[int, int] | None:
    target_section_number = max(1, min(4, ((question_number - 1) // 10) + 1))

    for scope in scopes:
        if scope["section_number"] == target_section_number:
            return scope["start_segment_index"], scope["end_segment_index"]

    return None


def get_question_part_range(question_number: int) -> tuple[int, int]:
    part_index = max(0, (question_number - 1) // 10)
    start_question = part_index * 10 + 1
    return start_question, start_question + 9


def get_question_part_number(question_number: int) -> int:
    return max(1, min(4, ((question_number - 1) // 10) + 1))


def find_listening_section_start_index(
    segments: list[ListeningTranscriptSegment],
    section_number: int,
    start_search_index: int = 0,
) -> int | None:
    markers = LISTENING_SECTION_TRANSITION_MARKERS.get(section_number, [])
    normalized_segment_texts = [
        normalize_alignment_text(segment.text)
        for segment in segments
    ]

    for segment_index in range(start_search_index, len(segments)):
        segment_text = normalized_segment_texts[segment_index]
        if any(marker in segment_text for marker in markers):
            return segment_index

    for segment_index in range(start_search_index, len(segments)):
        segment_text = normalized_segment_texts[segment_index]
        if "turn to" in segment_text and extract_section_number_from_text(segment_text) == section_number:
            return segment_index

    section_scopes = detect_section_scopes(segments)
    for scope in section_scopes:
        if scope["section_number"] == section_number:
            return max(0, scope["start_segment_index"] - 1)

    return None


def split_listening_transcript_into_parts(
    segments: list[ListeningTranscriptSegment],
) -> list[dict]:
    if not segments:
        return []

    start_indexes = {1: 0}
    search_start_index = 0
    for section_number in (2, 3, 4):
        start_index = find_listening_section_start_index(
            segments,
            section_number,
            start_search_index=search_start_index,
        )
        if start_index is None:
            raise ValueError(f"Could not locate transition marker for section {section_number}.")

        start_indexes[section_number] = start_index
        search_start_index = start_index + 1

    ordered_start_indexes = [
        start_indexes[1],
        start_indexes[2],
        start_indexes[3],
        start_indexes[4],
    ]
    if ordered_start_indexes != sorted(ordered_start_indexes) or len(set(ordered_start_indexes)) != 4:
        raise ValueError("Listening section boundaries are not strictly increasing.")

    parts: list[dict] = []
    for part_number, global_start_index in enumerate(ordered_start_indexes, start=1):
        global_end_index = (
            ordered_start_indexes[part_number]
            if part_number < 4
            else len(segments)
        )
        parts.append({
            "part_number": part_number,
            "global_start_index": global_start_index,
            "segments": segments[global_start_index:global_end_index],
        })

    return parts


def iter_exception_chain(ex: Exception):
    current: Exception | None = ex
    seen: set[int] = set()

    while current is not None and id(current) not in seen:
        yield current
        seen.add(id(current))
        next_error = current.__cause__ or current.__context__
        current = next_error if isinstance(next_error, Exception) else None


def extract_quota_retry_delay_seconds(ex: Exception) -> float | None:
    patterns = [
        r"retry in\s+([0-9]+(?:\.[0-9]+)?)s",
        r"'retrydelay':\s*'([0-9]+)s'",
        r'"retryDelay":\s*"([0-9]+)s"',
    ]

    for error in iter_exception_chain(ex):
        message = str(error)
        for pattern in patterns:
            match = re.search(pattern, message, flags=re.IGNORECASE)
            if match:
                try:
                    return max(1.0, float(match.group(1)))
                except ValueError:
                    continue

    return None


def is_gemini_quota_exhausted_error(ex: Exception) -> bool:
    quota_markers = [
        "resource_exhausted",
        "quota exceeded",
        "exceeded your current quota",
        "generate_requestsperday",
        "generatecontentinputtokenspermodelperday",
        "retrydelay",
    ]

    for error in iter_exception_chain(ex):
        if getattr(error, "status_code", None) == 429:
            return True

        message = str(error).lower()
        if any(marker in message for marker in quota_markers):
            return True

    return False


def is_gemini_alignment_quota_on_cooldown() -> bool:
    return gemini_alignment_quota_cooldown_until > time.monotonic()


def set_gemini_alignment_quota_cooldown(delay_seconds: float | None) -> None:
    global gemini_alignment_quota_cooldown_until

    if delay_seconds is None:
        delay_seconds = 45.0

    gemini_alignment_quota_cooldown_until = max(
        gemini_alignment_quota_cooldown_until,
        time.monotonic() + delay_seconds,
    )


def split_alignment_answer_candidates(value: str | None) -> list[str]:
    return [
        candidate
        for candidate in (normalize_alignment_text(item) for item in (value or "").split("|"))
        if len(candidate) >= 2
    ]


def get_alignment_answer_candidates(question: ListeningAlignmentQuestion) -> list[str]:
    candidates = split_alignment_answer_candidates(question.correct_answer)
    candidates.extend(
        candidate
        for candidate in (normalize_alignment_text(item) for item in question.correct_option_texts)
        if len(candidate) >= 2
    )
    return list(dict.fromkeys(candidates))


def get_alignment_evidence_tokens(question: ListeningAlignmentQuestion) -> list[str]:
    tokens: set[str] = set()

    for candidate in get_alignment_answer_candidates(question):
        tokens.update(extract_alignment_tokens(candidate))

    for option_text in question.correct_option_texts or []:
        tokens.update(extract_alignment_tokens(option_text))

    return [
        token
        for token in tokens
        if len(token) >= 3 and token not in ALIGNMENT_STOPWORDS
    ]


def get_alignment_keyword_tokens(question: ListeningAlignmentQuestion) -> list[str]:
    question_tokens = [
        token
        for token in extract_alignment_tokens(question.question_text)
        if len(token) >= 3 and token not in ALIGNMENT_STOPWORDS
    ]

    if len(question_tokens) >= 2:
        return question_tokens

    fallback_tokens = [
        token
        for token in extract_alignment_tokens(question.context_text)
        if len(token) >= 3 and token not in ALIGNMENT_STOPWORDS
    ]

    return list(dict.fromkeys([*question_tokens, *fallback_tokens]))


def get_alignment_anchor_phrases(question: ListeningAlignmentQuestion) -> list[str]:
    phrases: list[str] = []

    for source in [question.question_text or "", question.context_text or ""]:
        if not source.strip():
            continue

        for line in source.splitlines():
            normalized_line = normalize_alignment_text(line)
            if not normalized_line or len(normalized_line) < 3:
                continue

            phrases.append(normalized_line)

        normalized_source = normalize_alignment_text(source)
        if normalized_source and len(normalized_source) >= 3:
            phrases.append(normalized_source)

    deduped_phrases: list[str] = []
    seen: set[str] = set()
    for phrase in phrases:
        if phrase in seen:
            continue
        if len(phrase) > 140:
            continue

        seen.add(phrase)
        deduped_phrases.append(phrase)

    return deduped_phrases[:8]


def alignment_text_contains_candidate(segment_text: str, candidate: str) -> bool:
    if not candidate:
        return False

    if len(candidate) <= 3:
        return re.search(rf"(^|[^a-z0-9]){re.escape(candidate)}([^a-z0-9]|$)", segment_text) is not None

    return candidate in segment_text


def looks_like_introductory_alignment_segment(raw_text: str) -> bool:
    normalized = normalize_alignment_text(raw_text)
    return any(phrase in normalized for phrase in ALIGNMENT_INTRO_PHRASES)


def score_alignment_window(
    window_text: str,
    raw_text: str,
    anchor_phrases: list[str],
    answer_candidates: list[str],
    evidence_tokens: list[str],
    keyword_tokens: list[str],
    group_type: str | None = None,
) -> float:
    score = 0.0
    normalized_window_tokens = extract_alignment_tokens(window_text)
    evidence_match_count = 0
    has_direct_candidate_match = False
    requires_direct_evidence = bool(answer_candidates or evidence_tokens)
    keyword_match_count = 0
    strong_keyword_match_count = 0
    direct_anchor_match_count = 0
    anchor_match_count = 0
    normalized_group_type = (group_type or "").strip().upper()

    for phrase in anchor_phrases:
        if alignment_text_contains_candidate(window_text, phrase):
            score += 26 if len(phrase) >= 10 else 20
            direct_anchor_match_count += 1
            anchor_match_count += 1
            continue

        phrase_tokens = [token for token in phrase.split(" ") if len(token) >= 3]
        if not phrase_tokens:
            continue

        matched_tokens = sum(
            1
            for token in phrase_tokens
            if any(variant in normalized_window_tokens for variant in build_alignment_token_variants(token))
        )
        if matched_tokens == len(phrase_tokens):
            score += 12 if len(phrase_tokens) >= 3 else 8
            anchor_match_count += 1
        elif matched_tokens >= max(1, int(len(phrase_tokens) * 0.6 + 0.5)):
            score += 4
            anchor_match_count += 1

    for candidate in answer_candidates:
        if alignment_text_contains_candidate(window_text, candidate):
            score += 18 if len(candidate) >= 8 else 14
            has_direct_candidate_match = True
            continue

        candidate_tokens = [token for token in candidate.split(" ") if token]
        if len(candidate_tokens) >= 2:
            matched_tokens = sum(
                1
                for token in candidate_tokens
                if any(variant in normalized_window_tokens for variant in build_alignment_token_variants(token))
            )
            if matched_tokens == len(candidate_tokens):
                score += 10
                has_direct_candidate_match = True
            elif matched_tokens >= max(2, int(len(candidate_tokens) * 0.66 + 0.5)):
                score += 5

    for token in evidence_tokens:
        if token in normalized_window_tokens:
            evidence_match_count += 1
            score += 4 if len(token) >= 6 else 3

    for token in keyword_tokens:
        if token in normalized_window_tokens:
            keyword_match_count += 1
            if len(token) >= 6:
                strong_keyword_match_count += 1

            if requires_direct_evidence:
                score += 0.25 if len(token) >= 6 else 0.1
            else:
                score += 1.25 if len(token) >= 6 else 0.75

    if (normalized_group_type.startswith("MATCHING") or normalized_group_type.startswith("MCQ")) and direct_anchor_match_count > 0:
        score += max(0, window_text.count(" ") // 6) * 0.75

    if not requires_direct_evidence:
        if strong_keyword_match_count >= 1:
            score += 2.25
        if keyword_match_count >= 2:
            score += 1.5
        elif keyword_match_count == 1 and strong_keyword_match_count == 0:
            score += 0.5

    if requires_direct_evidence and not has_direct_candidate_match and evidence_match_count == 0:
        # Some multiple-choice answers are paraphrased rather than spoken verbatim.
        # Allow strong question-text overlap to survive as a lower-confidence candidate.
        if direct_anchor_match_count >= 1 or anchor_match_count >= 2:
            score += 3.0
        elif strong_keyword_match_count >= 1 and keyword_match_count >= 2:
            score += 1.5
        else:
            return 0.0

    if looks_like_introductory_alignment_segment(raw_text):
        if has_direct_candidate_match:
            score -= 2
        elif evidence_match_count > 0:
            score -= 8
        else:
            score -= 18

    if not requires_direct_evidence and not has_direct_candidate_match and evidence_match_count == 0 and score < 3.0:
        return 0.0

    if score <= 0:
        return 0.0

    return score


def format_alignment_time_label(seconds: float | None) -> str:
    total_seconds = max(0, int(seconds or 0))
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    remaining_seconds = total_seconds % 60

    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{remaining_seconds:02d}"

    return f"{minutes:02d}:{remaining_seconds:02d}"


def build_alignment_candidate_windows(
    segments: list[ListeningTranscriptSegment],
    question: ListeningAlignmentQuestion,
    allowed_segment_range: tuple[int, int] | None = None,
) -> list[dict]:
    normalized_segment_texts = [normalize_alignment_text(segment.text) for segment in segments]
    anchor_phrases = get_alignment_anchor_phrases(question)
    answer_candidates = get_alignment_answer_candidates(question)
    evidence_tokens = get_alignment_evidence_tokens(question)
    keyword_tokens = get_alignment_keyword_tokens(question)
    normalized_group_type = (question.group_type or "").strip().upper()

    if not anchor_phrases and not answer_candidates and not evidence_tokens and not keyword_tokens:
        return []

    candidates: list[dict] = []
    allowed_start_index = allowed_segment_range[0] if allowed_segment_range else 0
    allowed_end_index = allowed_segment_range[1] if allowed_segment_range else len(segments) - 1
    if normalized_group_type.startswith("MATCHING") or normalized_group_type.startswith("MCQ"):
        max_window_size = 4
    elif answer_candidates or evidence_tokens:
        max_window_size = 2
    else:
        max_window_size = 3

    for start_index in range(allowed_start_index, allowed_end_index + 1):
        max_end_index = min(allowed_end_index, start_index + max_window_size - 1)
        for end_index in range(start_index, max_end_index + 1):
            window_text = " ".join(normalized_segment_texts[start_index:end_index + 1]).strip()
            raw_text = " ".join(
                segment.text.strip()
                for segment in segments[start_index:end_index + 1]
                if segment.text and segment.text.strip()
            ).strip()
            score = score_alignment_window(
                window_text,
                raw_text,
                anchor_phrases,
                answer_candidates,
                evidence_tokens,
                keyword_tokens,
                normalized_group_type,
            )
            if score <= 0:
                continue

            # Prefer the shortest precise snippet when scores are otherwise similar.
            score -= (end_index - start_index) * 0.35
            if score <= 0:
                continue

            candidates.append({
                "segment_indexes": list(range(start_index, end_index + 1)),
                "start_index": start_index,
                "end_index": end_index,
                "score": score,
                "time_label": (
                    f"{format_alignment_time_label(segments[start_index].start_time)}"
                    f" - {format_alignment_time_label(segments[end_index].end_time or segments[end_index].start_time)}"
                ),
                "text": raw_text,
            })

    deduped_candidates: list[dict] = []
    seen_keys: set[tuple[int, ...]] = set()
    for candidate in sorted(candidates, key=lambda item: (-item["score"], len(item["segment_indexes"]), item["start_index"])):
        key = tuple(candidate["segment_indexes"])
        if key in seen_keys:
            continue

        seen_keys.add(key)
        deduped_candidates.append(candidate)
        if len(deduped_candidates) >= 12:
            break

    for index, candidate in enumerate(deduped_candidates, start=1):
        candidate["candidate_id"] = index

    return deduped_candidates


def select_fallback_alignment_candidate(
    candidates: list[dict],
    *,
    requires_direct_evidence: bool = False,
) -> tuple[dict | None, Literal["high", "medium", "low"]]:
    if not candidates:
        return None, "low"

    top_candidate = candidates[0]
    second_score = candidates[1]["score"] if len(candidates) > 1 else 0.0
    score_gap = top_candidate["score"] - second_score

    if requires_direct_evidence:
        if top_candidate["score"] < 8 and score_gap < 3:
            return None, "low"
    elif top_candidate["score"] < 3.5:
        return None, "low"

    if top_candidate["score"] >= 16 or score_gap >= 8:
        return top_candidate, "high"

    if top_candidate["score"] >= 9 or score_gap >= 3:
        return top_candidate, "medium"

    return top_candidate, "low"


def build_alignment_batch_prompt(batch_questions: list[tuple[ListeningAlignmentQuestion, list[dict]]]) -> str:
    ordered_question_numbers = [question.question_number for question, _ in batch_questions]
    batch_start_question = min(ordered_question_numbers) if ordered_question_numbers else 0
    batch_end_question = max(ordered_question_numbers) if ordered_question_numbers else 0
    blocks: list[str] = []

    for question, candidates in batch_questions:
        candidate_lines = []
        for candidate in candidates:
            candidate_lines.append(
                f"- Candidate {candidate['candidate_id']} | segments {candidate['segment_indexes']} | "
                f"[{candidate['time_label']}] {candidate['text']}"
            )

        blocks.append(
            "\n".join([
                f"Question {question.question_number}",
                f"Question text: {question.question_text or ''}",
                f"Correct answer: {question.correct_answer or ''}",
                f"Correct option texts: {', '.join(question.correct_option_texts or [])}",
                f"Context: {question.context_text or ''}",
                f"Group type: {question.group_type or ''}",
                "Rule: choose exactly one single candidate segment that directly states or clearly paraphrases the evidence.",
                "Rule: never choose greetings, instructions, introductions, scene-setting, or broad topic/setup lines.",
                "Rule: if no candidate is reliable, return null instead of guessing.",
                "Candidates:",
                *candidate_lines,
            ]).strip()
        )

    return (
        "You are aligning IELTS Listening questions to exact transcript segments.\n"
        f"This batch only covers questions {batch_start_question} to {batch_end_question}.\n"
        f"Return exactly {len(batch_questions)} selections: one for every listed question number, with no omissions and no extra question numbers.\n"
        "For each question, choose exactly one candidate_id whose single segment directly contains the spoken evidence for the correct answer.\n"
        "Use exact wording, spelled forms, and clear paraphrases.\n"
        "Do not choose based only on broad topic similarity.\n"
        "Do not choose greetings, instructions, scene-setting, introductions, or summary/setup lines.\n"
        "If one candidate mentions the topic generally and another candidate gives the actual answer detail, choose the actual answer detail.\n"
        "Do not reuse the same candidate for multiple different questions unless the exact same spoken evidence genuinely answers both.\n"
        "If none of the candidates clearly supports the correct answer, return null for candidate_id.\n\n"
        + "\n\n---\n\n".join(blocks)
    )


async def generate_alignment_batch_with_gemini_split(
    batch_questions: list[tuple[ListeningAlignmentQuestion, list[dict]]],
) -> ListeningAlignmentSelectionBatch:
    prompt = build_alignment_batch_prompt(batch_questions)

    try:
        return await asyncio.to_thread(
            generate_alignment_batch_with_gemini,
            prompt,
        )
    except GeminiAlignmentQuotaExhaustedError:
        raise
    except Exception:
        if len(batch_questions) <= 4:
            raise

        midpoint = len(batch_questions) // 2
        left_result = await generate_alignment_batch_with_gemini_split(batch_questions[:midpoint])
        right_result = await generate_alignment_batch_with_gemini_split(batch_questions[midpoint:])
        return ListeningAlignmentSelectionBatch(
            selections=[
                *left_result.selections,
                *right_result.selections,
            ]
        )


def generate_alignment_batch_with_gemini(
    prompt: str,
) -> ListeningAlignmentSelectionBatch:
    if gemini_client is None:
        raise RuntimeError("Gemini client is not configured.")

    if is_gemini_alignment_quota_on_cooldown():
        raise GeminiAlignmentQuotaExhaustedError(
            "Gemini alignment is temporarily on quota cooldown."
        )

    last_error: Exception | None = None
    saw_quota_error = False
    saw_non_quota_error = False
    for model_name in GEMINI_ALIGNMENT_MODEL_CANDIDATES:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=google_genai_types.GenerateContentConfig(
                    system_instruction=(
                        "You align IELTS Listening questions to transcript candidates. "
                        "Return only valid JSON that matches the requested schema."
                    ),
                    response_mime_type="application/json",
                    response_schema=ListeningAlignmentSelectionBatch,
                    temperature=0.1,
                    candidate_count=1,
                    max_output_tokens=2048,
                ),
            )
            if isinstance(response.parsed, ListeningAlignmentSelectionBatch):
                return response.parsed

            if isinstance(response.text, str) and response.text.strip():
                return ListeningAlignmentSelectionBatch.model_validate_json(response.text)

            raise RuntimeError(f"Gemini model {model_name} returned no structured alignment payload.")
        except Exception as ex:  # pragma: no cover
            last_error = ex
            if is_gemini_quota_exhausted_error(ex):
                saw_quota_error = True
                set_gemini_alignment_quota_cooldown(extract_quota_retry_delay_seconds(ex))
                logger.warning("Gemini alignment model %s quota exhausted.", model_name)
                continue

            saw_non_quota_error = True
            logger.exception("Gemini alignment model %s failed.", model_name)

    if saw_quota_error and not saw_non_quota_error:
        raise GeminiAlignmentQuotaExhaustedError(
            "All Gemini alignment model candidates are quota exhausted."
        ) from last_error

    raise RuntimeError("All Gemini alignment model candidates failed.") from last_error


def build_map_labelling_candidates(
    segments: list[ListeningTranscriptSegment],
    allowed_segment_range: tuple[int, int],
) -> list[dict]:
    normalized_segment_texts = [normalize_alignment_text(segment.text) for segment in segments]
    allowed_start_index, allowed_end_index = allowed_segment_range
    candidates: list[dict] = []

    for start_index in range(allowed_start_index, allowed_end_index + 1):
        max_end_index = min(allowed_end_index, start_index + 1)
        for end_index in range(start_index, max_end_index + 1):
            raw_text = " ".join(
                segment.text.strip()
                for segment in segments[start_index:end_index + 1]
                if segment.text and segment.text.strip()
            ).strip()
            normalized_window_text = " ".join(normalized_segment_texts[start_index:end_index + 1]).strip()

            if not raw_text or looks_like_introductory_alignment_segment(raw_text):
                continue

            score = 0.0
            for phrase in MAP_LOCATION_CUE_PHRASES:
                if phrase in normalized_window_text:
                    score += 3.0

            tokens = extract_alignment_tokens(normalized_window_text)
            token_match_count = sum(1 for token in MAP_LOCATION_TOKENS if token in tokens)
            score += token_match_count * 1.5

            if "turn" in tokens and ("left" in tokens or "right" in tokens):
                score += 1.5

            if "cross" in tokens and "bridge" in tokens:
                score += 1.5

            if score < 3.5:
                continue

            score -= (end_index - start_index) * 0.25
            candidates.append({
                "segment_indexes": list(range(start_index, end_index + 1)),
                "start_index": start_index,
                "end_index": end_index,
                "score": score,
                "time_label": (
                    f"{format_alignment_time_label(segments[start_index].start_time)}"
                    f" - {format_alignment_time_label(segments[end_index].end_time or segments[end_index].start_time)}"
                ),
                "text": raw_text,
            })

    deduped_candidates: list[dict] = []
    seen_keys: set[tuple[int, ...]] = set()
    for candidate in sorted(candidates, key=lambda item: (item["start_index"], -item["score"], len(item["segment_indexes"]))):
        key = tuple(candidate["segment_indexes"])
        if key in seen_keys:
            continue

        seen_keys.add(key)
        deduped_candidates.append(candidate)

    return deduped_candidates


def fill_map_labelling_gaps(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    segments: list[ListeningTranscriptSegment],
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> None:
    ordered_questions = sorted(
        [question for question in questions if (question.group_type or "").upper() == "MAP_LABELLING"],
        key=lambda item: item.question_number,
    )
    if not ordered_questions:
        return

    groups: list[list[ListeningAlignmentQuestion]] = []
    current_group: list[ListeningAlignmentQuestion] = []
    for question in ordered_questions:
        if current_group and question.question_number != current_group[-1].question_number + 1:
            groups.append(current_group)
            current_group = []
        current_group.append(question)

    if current_group:
        groups.append(current_group)

    for group in groups:
        scope = (
            find_scope_for_question(group[0].question_number, question_scopes)
            or find_section_scope_for_question(group[0].question_number, section_scopes)
        )
        if scope is None:
            continue

        candidate_pool = build_map_labelling_candidates(segments, scope)
        if not candidate_pool:
            continue

        used_candidate_indexes: set[int] = set()

        def mark_used_for_alignment(alignment: ListeningTranscriptQuestionAlignment) -> None:
            aligned_indexes = set(alignment.segment_indexes)
            for candidate_index, candidate in enumerate(candidate_pool):
                if aligned_indexes.intersection(candidate["segment_indexes"]):
                    used_candidate_indexes.add(candidate_index)

        for question in group:
            existing_alignment = alignments_by_question.get(question.question_number)
            if existing_alignment and existing_alignment.segment_indexes:
                mark_used_for_alignment(existing_alignment)

        previous_end_index = scope[0] - 1
        for index, question in enumerate(group):
            existing_alignment = alignments_by_question.get(question.question_number)
            if existing_alignment and existing_alignment.segment_indexes:
                previous_end_index = max(previous_end_index, max(existing_alignment.segment_indexes))
                continue

            next_anchor_start_index: int | None = None
            for later_question in group[index + 1:]:
                later_alignment = alignments_by_question.get(later_question.question_number)
                if later_alignment and later_alignment.segment_indexes:
                    next_anchor_start_index = min(later_alignment.segment_indexes)
                    break

            chosen_candidate_index: int | None = None
            for candidate_index, candidate in enumerate(candidate_pool):
                if candidate_index in used_candidate_indexes:
                    continue
                if candidate["start_index"] <= previous_end_index:
                    continue
                if next_anchor_start_index is not None and candidate["start_index"] >= next_anchor_start_index:
                    continue

                chosen_candidate_index = candidate_index
                break

            if chosen_candidate_index is None:
                continue

            chosen_candidate = candidate_pool[chosen_candidate_index]
            used_candidate_indexes.add(chosen_candidate_index)
            previous_end_index = chosen_candidate["end_index"]
            alignments_by_question[question.question_number] = ListeningTranscriptQuestionAlignment(
                question_number=question.question_number,
                segment_indexes=chosen_candidate["segment_indexes"],
                confidence="low",
            )


def get_alignment_scope_key(
    question_number: int,
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> tuple:
    for scope in question_scopes:
        if scope["start_question"] <= question_number <= scope["end_question"]:
            return ("question-range", scope["start_question"], scope["end_question"])

    target_section_number = max(1, min(4, ((question_number - 1) // 10) + 1))
    for scope in section_scopes:
        if scope["section_number"] == target_section_number:
            return ("section", target_section_number)

    start_question, end_question = get_question_part_range(question_number)
    return ("part", start_question, end_question)


def find_matching_alignment_candidate(
    candidates: list[dict],
    segment_indexes: list[int] | None,
) -> dict | None:
    if not candidates or not segment_indexes:
        return None

    target_key = tuple(segment_indexes)
    for candidate in candidates:
        if tuple(candidate["segment_indexes"]) == target_key:
            return candidate

    return None


def reconcile_alignment_gaps_and_duplicates(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    candidate_lists_by_question: dict[int, list[dict]],
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> None:
    grouped_questions: dict[tuple, list[ListeningAlignmentQuestion]] = {}
    for question in sorted(questions, key=lambda item: item.question_number):
        if (question.group_type or "").upper() == "MAP_LABELLING":
            continue
        if question.question_number not in candidate_lists_by_question:
            continue

        scope_key = get_alignment_scope_key(question.question_number, question_scopes, section_scopes)
        grouped_questions.setdefault(scope_key, []).append(question)

    for ordered_questions in grouped_questions.values():
        if len(ordered_questions) < 2:
            continue

        selected_candidates_by_question: dict[int, dict | None] = {}
        for question in ordered_questions:
            alignment = alignments_by_question.get(question.question_number)
            selected_candidates_by_question[question.question_number] = find_matching_alignment_candidate(
                candidate_lists_by_question.get(question.question_number, []),
                alignment.segment_indexes if alignment else None,
            )

        duplicate_groups: dict[tuple[int, ...], list[ListeningAlignmentQuestion]] = {}
        for question in ordered_questions:
            selected_candidate = selected_candidates_by_question.get(question.question_number)
            if selected_candidate is None:
                continue

            duplicate_groups.setdefault(tuple(selected_candidate["segment_indexes"]), []).append(question)

        for duplicate_questions in duplicate_groups.values():
            if len(duplicate_questions) <= 1:
                continue

            def duplicate_priority(item: ListeningAlignmentQuestion) -> tuple[int, float, int]:
                alignment = alignments_by_question.get(item.question_number)
                confidence_rank = 0
                if alignment and alignment.confidence == "high":
                    confidence_rank = 2
                elif alignment and alignment.confidence == "medium":
                    confidence_rank = 1

                candidate = selected_candidates_by_question.get(item.question_number)
                candidate_score = candidate["score"] if candidate is not None else 0.0
                return confidence_rank, candidate_score, -item.question_number

            keeper = max(duplicate_questions, key=duplicate_priority)
            for question in duplicate_questions:
                if question.question_number == keeper.question_number:
                    continue

                selected_candidates_by_question[question.question_number] = None
                alignments_by_question[question.question_number] = ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=[],
                    confidence="low",
                )

        for _ in range(3):
            made_change = False

            for index, question in enumerate(ordered_questions):
                question_number = question.question_number
                current_alignment = alignments_by_question.get(question_number)
                current_candidate = selected_candidates_by_question.get(question_number)
                if current_candidate is not None and current_alignment and current_alignment.segment_indexes:
                    continue

                candidates = candidate_lists_by_question.get(question_number, [])
                if not candidates:
                    continue

                previous_candidate: dict | None = None
                for previous_question in reversed(ordered_questions[:index]):
                    previous_candidate = selected_candidates_by_question.get(previous_question.question_number)
                    if previous_candidate is not None:
                        break

                next_candidate: dict | None = None
                for next_question in ordered_questions[index + 1:]:
                    next_candidate = selected_candidates_by_question.get(next_question.question_number)
                    if next_candidate is not None:
                        break

                used_signatures = {
                    tuple(candidate["segment_indexes"])
                    for other_question_number, candidate in selected_candidates_by_question.items()
                    if other_question_number != question_number and candidate is not None
                }
                used_segment_indexes = {
                    segment_index
                    for other_question_number, candidate in selected_candidates_by_question.items()
                    if other_question_number != question_number and candidate is not None
                    for segment_index in candidate["segment_indexes"]
                }

                best_candidate: dict | None = None
                best_adjusted_score = float("-inf")
                for candidate in candidates:
                    adjusted_score = candidate["score"]
                    candidate_signature = tuple(candidate["segment_indexes"])
                    if candidate_signature in used_signatures:
                        adjusted_score -= 20

                    overlap_count = len(set(candidate["segment_indexes"]).intersection(used_segment_indexes))
                    adjusted_score -= overlap_count * 4.5

                    if previous_candidate is not None and candidate["end_index"] < previous_candidate["start_index"]:
                        adjusted_score -= 4 + min(
                            6.0,
                            (previous_candidate["start_index"] - candidate["end_index"]) * 0.25,
                        )

                    if next_candidate is not None and candidate["start_index"] > next_candidate["end_index"]:
                        adjusted_score -= 4 + min(
                            6.0,
                            (candidate["start_index"] - next_candidate["end_index"]) * 0.25,
                        )

                    if (
                        previous_candidate is not None
                        and next_candidate is not None
                        and previous_candidate["end_index"] < candidate["start_index"] < next_candidate["start_index"]
                    ):
                        adjusted_score += 1.5

                    if adjusted_score > best_adjusted_score:
                        best_adjusted_score = adjusted_score
                        best_candidate = candidate

                requires_direct_evidence = bool(
                    get_alignment_answer_candidates(question) or get_alignment_evidence_tokens(question)
                )
                minimum_score = 4.0 if requires_direct_evidence else 3.0
                if best_candidate is None or best_adjusted_score < minimum_score:
                    continue

                confidence: Literal["high", "medium", "low"]
                if best_adjusted_score >= 12:
                    confidence = "high"
                elif best_adjusted_score >= 7:
                    confidence = "medium"
                else:
                    confidence = "low"

                selected_candidates_by_question[question_number] = best_candidate
                alignments_by_question[question_number] = ListeningTranscriptQuestionAlignment(
                    question_number=question_number,
                    segment_indexes=best_candidate["segment_indexes"],
                    confidence=confidence,
                )
                made_change = True

            if not made_change:
                break


def optimize_alignment_sequences(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    candidate_lists_by_question: dict[int, list[dict]],
    question_scopes: list[dict],
    section_scopes: list[dict],
) -> None:
    grouped_questions: dict[tuple, list[ListeningAlignmentQuestion]] = {}
    for question in sorted(questions, key=lambda item: item.question_number):
        if (question.group_type or "").upper() == "MAP_LABELLING":
            continue
        if question.question_number not in candidate_lists_by_question:
            continue

        scope_key = get_alignment_scope_key(question.question_number, question_scopes, section_scopes)
        grouped_questions.setdefault(scope_key, []).append(question)

    for ordered_questions in grouped_questions.values():
        if len(ordered_questions) < 2:
            continue

        state_scores: dict[int, float] = {-1: 0.0}
        state_paths: dict[int, list[tuple[int, dict | None]]] = {-1: []}

        for question in ordered_questions:
            question_number = question.question_number
            existing_alignment = alignments_by_question.get(question_number)
            existing_signature = (
                tuple(existing_alignment.segment_indexes)
                if existing_alignment and existing_alignment.segment_indexes
                else None
            )
            confidence_bonus = 0.0
            if existing_alignment and existing_alignment.confidence == "high":
                confidence_bonus = 3.5
            elif existing_alignment and existing_alignment.confidence == "medium":
                confidence_bonus = 2.0
            elif existing_alignment and existing_alignment.confidence == "low":
                confidence_bonus = 0.75

            question_candidates = candidate_lists_by_question.get(question_number, [])[:8]
            if existing_signature and existing_alignment and existing_alignment.confidence in {"high", "medium"}:
                anchored_candidates = [
                    candidate
                    for candidate in question_candidates
                    if tuple(candidate["segment_indexes"]) == existing_signature
                ]
                if anchored_candidates:
                    question_candidates = anchored_candidates

            next_state_scores: dict[int, float] = {}
            next_state_paths: dict[int, list[tuple[int, dict | None]]] = {}

            for previous_end_index, previous_score in state_scores.items():
                previous_path = state_paths[previous_end_index]

                allow_null = not (
                    existing_signature
                    and existing_alignment
                    and existing_alignment.confidence in {"high", "medium"}
                )
                if allow_null:
                    null_score = previous_score - 3.5
                    best_null_score = next_state_scores.get(previous_end_index, float("-inf"))
                    if null_score > best_null_score:
                        next_state_scores[previous_end_index] = null_score
                        next_state_paths[previous_end_index] = [
                            *previous_path,
                            (question_number, None),
                        ]

                for candidate in question_candidates:
                    if candidate["start_index"] <= previous_end_index:
                        continue

                    candidate_score = float(candidate["score"])
                    if tuple(candidate["segment_indexes"]) == existing_signature:
                        candidate_score += confidence_bonus

                    if len(candidate["segment_indexes"]) > 1:
                        candidate_score -= 0.35 * (len(candidate["segment_indexes"]) - 1)

                    state_end_index = candidate["end_index"]
                    combined_score = previous_score + candidate_score
                    best_candidate_score = next_state_scores.get(state_end_index, float("-inf"))
                    if combined_score > best_candidate_score:
                        next_state_scores[state_end_index] = combined_score
                        next_state_paths[state_end_index] = [
                            *previous_path,
                            (question_number, candidate),
                        ]

            if not next_state_scores:
                continue

            state_scores = next_state_scores
            state_paths = next_state_paths

        if not state_scores:
            continue

        best_end_index = max(state_scores, key=lambda key: state_scores[key])
        best_path = state_paths[best_end_index]
        for question_number, candidate in best_path:
            existing_alignment = alignments_by_question.get(question_number)
            if candidate is not None and existing_alignment and tuple(existing_alignment.segment_indexes) == tuple(candidate["segment_indexes"]):
                confidence = existing_alignment.confidence or "medium"
            else:
                confidence = "medium" if candidate else "low"

            alignments_by_question[question_number] = ListeningTranscriptQuestionAlignment(
                question_number=question_number,
                segment_indexes=candidate["segment_indexes"] if candidate else [],
                confidence=confidence,
            )


def collapse_alignment_to_anchor_segments(
    questions: list[ListeningAlignmentQuestion],
    alignments_by_question: dict[int, ListeningTranscriptQuestionAlignment],
    segments: list[ListeningTranscriptSegment],
) -> None:
    questions_by_number = {
        question.question_number: question
        for question in questions
    }

    for question_number, alignment in list(alignments_by_question.items()):
        if not alignment.segment_indexes or len(alignment.segment_indexes) <= 1:
            continue

        question = questions_by_number.get(question_number)
        if question is None:
            continue
        normalized_group_type = (question.group_type or "").strip().upper()
        if normalized_group_type == "MAP_LABELLING" or normalized_group_type.startswith("MATCHING"):
            continue

        anchor_phrases = get_alignment_anchor_phrases(question)
        answer_candidates = get_alignment_answer_candidates(question)
        evidence_tokens = get_alignment_evidence_tokens(question)
        keyword_tokens = get_alignment_keyword_tokens(question)

        best_segment_index: int | None = None
        best_segment_score = float("-inf")
        for segment_index in alignment.segment_indexes:
            if segment_index < 0 or segment_index >= len(segments):
                continue

            segment_text = normalize_alignment_text(segments[segment_index].text)
            raw_text = segments[segment_index].text
            segment_score = score_alignment_window(
                segment_text,
                raw_text,
                anchor_phrases,
                answer_candidates,
                evidence_tokens,
                keyword_tokens,
                normalized_group_type,
            )
            if segment_score > best_segment_score:
                best_segment_score = segment_score
                best_segment_index = segment_index

        if best_segment_index is None:
            continue

        alignments_by_question[question_number] = ListeningTranscriptQuestionAlignment(
            question_number=question_number,
            segment_indexes=[best_segment_index],
            confidence=alignment.confidence,
        )


WRITING_RUBRICS = [
    "Task Achievement",
    "Coherence and Cohesion",
    "Lexical Resource",
    "Grammatical Range and Accuracy",
]

SPEAKING_RUBRICS = [
    "Fluency and Coherence",
    "Lexical Resource",
    "Grammatical Range and Accuracy",
    "Pronunciation",
]

SPEAKING_GEMINI_RUBRICS = [
    "Fluency and Coherence",
    "Lexical Resource",
    "Grammatical Range and Accuracy",
]


def build_scoring_prompt(text: str, rubrics: list[str], skill_type: str, question_prompt: str | None) -> str:
    rubric_list = "\n".join(f"- {r}" for r in rubrics)
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
    prompt_text: str,
    *,
    voice_name: str | None = None,
) -> bytes:
    return await asyncio.to_thread(
        generate_speaking_prompt_audio_with_gemini,
        prompt_text,
        voice_name=voice_name,
    )


async def call_scoring_model(prompt: str) -> StructuredScoreResult:
    return await generate_structured_content_with_gemini_async(
        prompt=prompt,
        system_instruction=(
            "You are an IELTS examiner. Return only valid JSON that matches the requested schema."
        ),
        response_schema=StructuredScoreResult,
        model_candidates=GEMINI_SCORING_MODEL_CANDIDATES,
        error_context="scoring",
        max_output_tokens=2048,
    )


SPEAKING_FILLER_PHRASES = (
    "uh",
    "um",
    "erm",
    "ah",
    "you know",
    "i mean",
    "kind of",
    "sort of",
)

SPEAKING_CONNECTOR_PHRASES = (
    "because",
    "so",
    "but",
    "also",
    "however",
    "for example",
    "for instance",
    "personally",
    "in my opinion",
    "first",
    "second",
    "finally",
    "although",
    "while",
)

SPEAKING_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by", "do", "does",
    "for", "from", "had", "has", "have", "he", "her", "hers", "him", "his", "i", "if", "in",
    "is", "it", "its", "me", "my", "of", "on", "or", "our", "ours", "she", "that", "the",
    "their", "theirs", "them", "they", "this", "to", "us", "was", "we", "were", "with", "you",
    "your", "yours",
}


def clamp_band(value: float) -> float:
    return max(0.0, min(9.0, value))


def round_band_half(value: float) -> float:
    return round(clamp_band(value) * 2) / 2


def clamp_speaking_band_to_rule_window(
    rule_band: float,
    gemini_band: float,
    *,
    max_adjustment: float = 1.0,
) -> float:
    lower_bound = clamp_band(rule_band - max_adjustment)
    upper_bound = clamp_band(rule_band + max_adjustment)
    return round_band_half(min(upper_bound, max(lower_bound, gemini_band)))


def normalize_speaking_prompt_type(part_number: int | None, prompt_type: str | None = None) -> str:
    normalized = (prompt_type or "").strip().lower().replace("-", "_")
    if normalized in {"part2_long_turn", "cue_card", "long_turn"}:
        return "part2_long_turn"
    if normalized in {"part2_follow_up", "follow_up", "short_response"}:
        return "part2_follow_up" if part_number == 2 else "short_response"
    if part_number == 1:
        return "part1_short_answer"
    if part_number == 2:
        return "part2_follow_up"
    if part_number == 3:
        return "part3_discussion"
    return "unknown"


def get_speaking_target_duration_seconds(
    part_number: int | None,
    prompt_type: str | None = None,
    target_duration_seconds: float | None = None,
) -> float | None:
    if target_duration_seconds is not None and target_duration_seconds > 0:
        return target_duration_seconds

    normalized_prompt_type = normalize_speaking_prompt_type(part_number, prompt_type)
    if part_number == 1:
        return 30.0
    if normalized_prompt_type == "part2_long_turn":
        return 120.0
    if normalized_prompt_type == "part2_follow_up":
        return 35.0
    if part_number == 3:
        return 60.0
    return None


def extract_speaking_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def count_phrase_occurrences(text: str, phrases: tuple[str, ...]) -> int:
    normalized = f" {re.sub(r'\\s+', ' ', text.lower()).strip()} "
    return sum(normalized.count(f" {phrase} ") for phrase in phrases)


def normalize_audio_to_16khz_mono_wav(file_path: str) -> tuple[str, str | None, str | None]:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return file_path, None, None

    output_file = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    output_path = output_file.name
    output_file.close()

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
        try:
            os.unlink(output_path)
        except OSError:
            pass
        return file_path, None, f"Could not normalize audio to 16kHz mono WAV: {ex}"


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


def transcribe_audio_file(
    file_path: str,
    *,
    language: str = "en",
    word_timestamps: bool = False,
) -> tuple[list[Segment], str]:
    if whisper_model is None:
        raise RuntimeError("Whisper model not loaded.")

    segments, _ = whisper_model.transcribe(
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


def infer_duration_seconds(segments: list[Segment], fallback_duration_seconds: float | None) -> float | None:
    if fallback_duration_seconds is not None and fallback_duration_seconds > 0:
        return fallback_duration_seconds

    word_ends = [
        word.end
        for segment in segments
        for word in (segment.words or [])
        if word.end is not None
    ]
    if word_ends:
        return max(word_ends)

    segment_ends = [segment.end for segment in segments if segment.end is not None]
    if segment_ends:
        return max(segment_ends)

    return None


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


def build_word_timestamp_evidence(segments: list[Segment], *, limit: int = 500) -> list[SpeakingWordTimestamp]:
    words = flatten_speaking_words(segments)
    return [
        SpeakingWordTimestamp(
            word=word.word.strip(),
            start=round(word.start, 2) if word.start is not None else None,
            end=round(word.end, 2) if word.end is not None else None,
            probability=round(float(word.probability), 3) if word.probability is not None else None,
        )
        for word in words[:limit]
    ]


def build_low_confidence_word_evidence(
    word_timestamps: list[SpeakingWordTimestamp],
    *,
    threshold: float = 0.65,
    limit: int = 12,
) -> list[SpeakingWordTimestamp]:
    low_confidence_words = [
        item
        for item in word_timestamps
        if item.probability is not None and item.probability < threshold
    ]
    return sorted(
        low_confidence_words,
        key=lambda item: (item.probability if item.probability is not None else 1.0, item.start or 0.0),
    )[:limit]


def build_speaking_feature_map(
    transcript: str,
    segments: list[Segment],
    *,
    part_number: int | None,
    prompt_type: str | None,
    target_duration_seconds: float | None,
    duration_seconds: float | None,
) -> dict[str, float | int | None]:
    tokens = extract_speaking_tokens(transcript)
    total_words = len(tokens)
    unique_ratio = (len(set(tokens)) / total_words) if total_words else 0.0
    content_tokens = [token for token in tokens if token not in SPEAKING_STOPWORDS]
    content_ratio = (len(content_tokens) / total_words) if total_words else 0.0
    long_word_ratio = (
        sum(1 for token in tokens if len(token) >= 7) / total_words
        if total_words
        else 0.0
    )
    filler_count = count_phrase_occurrences(transcript, SPEAKING_FILLER_PHRASES)
    filler_ratio = filler_count / max(total_words, 1)
    connector_count = count_phrase_occurrences(transcript, SPEAKING_CONNECTOR_PHRASES)

    consecutive_repetitions = sum(
        1
        for index in range(1, total_words)
        if tokens[index] == tokens[index - 1]
    )
    repetition_ratio = (
        consecutive_repetitions / max(total_words - 1, 1)
        if total_words > 1
        else 0.0
    )

    punctuation_sentences = len(re.findall(r"[.!?]", transcript))
    sentence_units = max(1, punctuation_sentences or len(segments) or 1)
    avg_words_per_sentence = total_words / sentence_units if sentence_units else float(total_words)

    effective_duration_seconds = infer_duration_seconds(segments, duration_seconds)
    words_per_minute = (
        round((total_words / effective_duration_seconds) * 60, 1)
        if total_words and effective_duration_seconds and effective_duration_seconds > 0
        else None
    )

    flat_words = flatten_speaking_words(segments)

    if flat_words:
        word_probabilities = [
            float(word.probability)
            for word in flat_words
            if word.probability is not None
        ]
        mean_word_probability = (
            sum(word_probabilities) / len(word_probabilities)
            if word_probabilities
            else 0.0
        )
        low_confidence_ratio = (
            sum(1 for probability in word_probabilities if probability < 0.55) / len(word_probabilities)
            if word_probabilities
            else 0.0
        )
    else:
        derived_probabilities = [
            max(0.05, min(0.99, math.exp(segment.avg_logprob)))
            for segment in segments
        ]
        mean_word_probability = (
            sum(derived_probabilities) / len(derived_probabilities)
            if derived_probabilities
            else 0.0
        )
        low_confidence_ratio = (
            sum(1 for probability in derived_probabilities if probability < 0.55) / len(derived_probabilities)
            if derived_probabilities
            else 0.0
        )

    pauses = get_speaking_pauses(segments, flat_words)
    pause_stats = build_speaking_pause_stats(pauses)
    total_pause_seconds = pause_stats.total_pause_seconds
    pause_ratio = (
        total_pause_seconds / effective_duration_seconds
        if effective_duration_seconds and effective_duration_seconds > 0
        else 0.0
    )
    avg_no_speech_prob = (
        sum(segment.no_speech_prob for segment in segments) / len(segments)
        if segments
        else None
    )
    effective_target_duration_seconds = get_speaking_target_duration_seconds(
        part_number,
        prompt_type,
        target_duration_seconds,
    )
    coverage_ratio = (
        effective_duration_seconds / effective_target_duration_seconds
        if effective_duration_seconds and effective_target_duration_seconds and effective_target_duration_seconds > 0
        else None
    )

    return {
        "word_count": total_words,
        "unique_ratio": unique_ratio,
        "content_ratio": content_ratio,
        "long_word_ratio": long_word_ratio,
        "filler_count": filler_count,
        "filler_ratio": filler_ratio,
        "connector_count": connector_count,
        "repetition_ratio": repetition_ratio,
        "sentence_units": sentence_units,
        "avg_words_per_sentence": avg_words_per_sentence,
        "duration_seconds": effective_duration_seconds,
        "words_per_minute": words_per_minute,
        "mean_word_probability": mean_word_probability,
        "low_confidence_ratio": low_confidence_ratio,
        "asr_confidence": mean_word_probability if segments else None,
        "pause_ratio": pause_ratio,
        "pause_count": pause_stats.pause_count,
        "long_pause_count": pause_stats.long_pause_count,
        "total_pause_seconds": pause_stats.total_pause_seconds,
        "average_pause_seconds": pause_stats.average_pause_seconds,
        "longest_pause_seconds": pause_stats.longest_pause_seconds,
        "speech_ratio": calculate_speech_ratio(
            segments,
            duration_seconds=effective_duration_seconds,
            flat_words=flat_words,
        ),
        "avg_no_speech_prob": avg_no_speech_prob,
        "target_duration_seconds": effective_target_duration_seconds,
        "coverage_ratio": coverage_ratio,
    }


def build_speaking_comment(
    *,
    criteria: str,
    band: float,
    features: dict[str, float | int | None],
    audio_backed: bool,
) -> tuple[str, str]:
    word_count = int(features["word_count"] or 0)
    words_per_minute = features["words_per_minute"]
    pause_ratio = float(features["pause_ratio"] or 0.0)
    connector_count = int(features["connector_count"] or 0)
    unique_ratio = float(features["unique_ratio"] or 0.0)
    repetition_ratio = float(features["repetition_ratio"] or 0.0)
    mean_word_probability = float(features["mean_word_probability"] or 0.0)
    low_confidence_ratio = float(features["low_confidence_ratio"] or 0.0)
    filler_ratio = float(features["filler_ratio"] or 0.0)

    if criteria == "Fluency and Coherence":
        pace_text = f"tốc độ nói khoảng {words_per_minute} WPM" if words_per_minute is not None else "nhịp nói chưa đủ dữ liệu thời lượng"
        comment = (
            f"Bài nói có khoảng {word_count} từ; {pace_text}. "
            f"Mức ngắt quãng đang ở khoảng {round(pause_ratio * 100)}% thời lượng và số liên từ ý là {connector_count}."
        )
        improvements = (
            "Giữ câu trả lời theo 2-3 ý rõ ràng, nối ý bằng because/so/however/for example, "
            "và giảm các quãng dừng dài hoặc filler không cần thiết."
        )
        return comment, improvements

    if criteria == "Lexical Resource":
        comment = (
            f"Độ đa dạng từ vựng hiện ở khoảng {round(unique_ratio * 100)}%, "
            f"tỉ lệ lặp từ liên tiếp khoảng {round(repetition_ratio * 100)}%."
        )
        improvements = (
            "Mở rộng paraphrase cho các ý quen thuộc, thay từ lặp bằng collocation tự nhiên, "
            "và thêm ví dụ cụ thể thay vì lặp lại cùng một cụm từ."
        )
        return comment, improvements

    if criteria == "Grammatical Range and Accuracy":
        grammar_available = int(features.get("grammar_engine_available") or 0) == 1
        grammar_error_count = int(features.get("grammar_error_count") or 0)
        grammar_density = float(features.get("grammar_error_density_per_100_words") or 0.0)
        if grammar_available:
            if grammar_error_count:
                comment = (
                    f"LanguageTool phát hiện khoảng {grammar_error_count} lỗi/điểm cần kiểm tra, "
                    f"mật độ lỗi có trọng số khoảng {grammar_density:.1f}/100 từ. "
                    f"Câu trả lời có khoảng {int(features['sentence_units'] or 1)} đơn vị ý."
                )
                improvements = (
                    "Ưu tiên sửa các lỗi grammar được liệt kê trong evidence, rồi luyện mở rộng câu bằng "
                    "mệnh đề because/although/when mà vẫn giữ chủ ngữ-động từ rõ ràng."
                )
                return comment, improvements
            comment = (
                "LanguageTool không phát hiện lỗi ngữ pháp rõ ràng trong transcript; "
                f"câu trả lời có khoảng {int(features['sentence_units'] or 1)} đơn vị ý, "
                f"độ dài trung bình khoảng {round(float(features['avg_words_per_sentence'] or 0.0), 1)} từ/ý."
            )
            improvements = (
                "Tiếp theo nên tăng range bằng câu phụ thuộc, mệnh đề quan hệ hoặc điều kiện tự nhiên, "
                "thay vì chỉ dùng các câu đơn an toàn."
            )
            return comment, improvements

        comment = (
            f"Câu trả lời được chia thành khoảng {int(features['sentence_units'] or 1)} đơn vị ý, "
            f"độ dài trung bình khoảng {round(float(features['avg_words_per_sentence'] or 0.0), 1)} từ/ý."
        )
        improvements = (
            "Luyện kết hợp câu đơn với câu có mệnh đề because/although/when, "
            "giữ mỗi ý trọn vẹn chủ ngữ-động từ-tân ngữ và tránh lặp cấu trúc quá ngắn."
        )
        return comment, improvements

    confidence_text = (
        f"Độ rõ theo ASR khoảng {round(mean_word_probability * 100)}%"
        if audio_backed
        else "Điểm này đang dựa chủ yếu trên transcript vì chưa có đủ đặc trưng audio"
    )
    comment = (
        f"{confidence_text}; tỉ lệ từ có độ chắc thấp khoảng {round(low_confidence_ratio * 100)}% "
        f"và filler khoảng {round(filler_ratio * 100)}%."
    )
    improvements = (
        "Nói chậm hơn một chút ở từ khóa, nhấn trọng âm rõ ở danh từ/động từ chính, "
        "và giữ hơi đều để cuối câu không bị nuốt âm."
    )
    return comment, improvements


def format_percent(value: float | int | None) -> str:
    if value is None:
        return "n/a"
    return f"{round(float(value) * 100)}%"


def shorten_evidence_text(value: str | None, *, max_length: int = 90) -> str:
    cleaned = re.sub(r"\s+", " ", (value or "").strip())
    if len(cleaned) <= max_length:
        return cleaned
    return f"{cleaned[:max_length - 1].rstrip()}..."


def get_languagetool_issue_weight(category: str | None, issue_type: str | None) -> float:
    category_id = (category or "").upper()
    issue = (issue_type or "").lower()

    if category_id == "GRAMMAR" or issue == "grammar":
        return 1.0
    if category_id in {"CONFUSED_WORDS", "COLLOCATIONS"}:
        return 0.85
    if category_id in {"TYPOS", "MISSPELLING"} or issue == "misspelling":
        # ASR may spell proper nouns incorrectly, so spelling has weaker grammar weight.
        return 0.4
    if category_id in {"PUNCTUATION", "CASING", "TYPOGRAPHY"}:
        # Speaking transcripts are ASR-generated, so punctuation/casing is weak evidence.
        return 0.1
    if category_id in {"STYLE", "REDUNDANCY"}:
        return 0.25
    return 0.5


def build_languagetool_issue(match: dict) -> SpeakingGrammarIssue | None:
    rule = match.get("rule") if isinstance(match.get("rule"), dict) else {}
    category = rule.get("category") if isinstance(rule.get("category"), dict) else {}
    context = match.get("context") if isinstance(match.get("context"), dict) else {}
    replacements_raw = match.get("replacements") if isinstance(match.get("replacements"), list) else []
    replacements = [
        shorten_evidence_text(item.get("value"), max_length=40)
        for item in replacements_raw
        if isinstance(item, dict) and item.get("value")
    ][:3]

    message = shorten_evidence_text(match.get("message"), max_length=120)
    if not message:
        return None

    matched_text = None
    context_text = context.get("text") if isinstance(context.get("text"), str) else None
    context_offset = context.get("offset")
    context_length = context.get("length")
    if context_text and isinstance(context_offset, int) and isinstance(context_length, int) and context_length > 0:
        matched_text = context_text[context_offset:context_offset + context_length]
    if not matched_text:
        offset = match.get("offset")
        length = match.get("length")
        if isinstance(offset, int) and isinstance(length, int) and length > 0:
            matched_text = context_text[offset:offset + length] if context_text else None

    category_id = category.get("id") if isinstance(category.get("id"), str) else None
    issue_type = rule.get("issueType") if isinstance(rule.get("issueType"), str) else None
    return SpeakingGrammarIssue(
        rule_id=rule.get("id") if isinstance(rule.get("id"), str) else None,
        category=category_id,
        issue_type=issue_type,
        message=message,
        matched_text=shorten_evidence_text(matched_text, max_length=45) if matched_text else None,
        offset=match.get("offset") if isinstance(match.get("offset"), int) else None,
        length=match.get("length") if isinstance(match.get("length"), int) else None,
        replacements=replacements,
        weight=get_languagetool_issue_weight(category_id, issue_type),
    )


def analyze_speaking_grammar_with_languagetool(
    transcript: str,
    *,
    word_count: int,
) -> SpeakingGrammarAnalysis:
    global languagetool_unavailable_until

    analysis = SpeakingGrammarAnalysis(
        language=LANGUAGETOOL_LANGUAGE,
        is_available=False,
    )
    if not LANGUAGETOOL_ENABLED:
        analysis.engine = "disabled"
        analysis.warnings.append("LanguageTool is disabled; grammar scoring used heuristic features only.")
        return analysis
    if not LANGUAGETOOL_URL:
        analysis.engine = "not_configured"
        analysis.warnings.append("LanguageTool URL is not configured; grammar scoring used heuristic features only.")
        return analysis
    if word_count < 5:
        analysis.engine = "skipped_short_answer"
        analysis.warnings.append("Answer is too short for reliable LanguageTool grammar analysis.")
        return analysis

    now = time.time()
    if now < languagetool_unavailable_until:
        analysis.engine = "temporarily_unavailable"
        analysis.warnings.append("LanguageTool was recently unavailable; grammar scoring used heuristic features only.")
        return analysis

    payload = urlencode({
        "text": transcript[:10000],
        "language": LANGUAGETOOL_LANGUAGE,
        "enabledOnly": "false",
    }).encode("utf-8")
    request = Request(
        LANGUAGETOOL_URL,
        data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=LANGUAGETOOL_TIMEOUT_SECONDS) as response:
            raw = response.read()
        data = json.loads(raw.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, OSError) as ex:
        languagetool_unavailable_until = time.time() + LANGUAGETOOL_UNAVAILABLE_COOLDOWN_SECONDS
        analysis.engine = "unavailable"
        analysis.warnings.append(f"LanguageTool unavailable: {shorten_evidence_text(str(ex), max_length=120)}")
        return analysis

    matches = data.get("matches") if isinstance(data, dict) else None
    if not isinstance(matches, list):
        analysis.engine = "invalid_response"
        analysis.warnings.append("LanguageTool returned an invalid response; grammar scoring used heuristic features only.")
        return analysis

    issues = [
        issue
        for issue in (build_languagetool_issue(match) for match in matches if isinstance(match, dict))
        if issue is not None
    ]
    category_counts = Counter(issue.category or "UNKNOWN" for issue in issues)
    weighted_error_count = sum(issue.weight for issue in issues)
    return SpeakingGrammarAnalysis(
        engine="languagetool_http",
        language=LANGUAGETOOL_LANGUAGE,
        is_available=True,
        error_count=len(issues),
        weighted_error_count=round(weighted_error_count, 2),
        error_density_per_100_words=round((weighted_error_count / max(word_count, 1)) * 100, 2),
        category_counts=dict(category_counts),
        issues=issues[:12],
    )


def build_grammar_feature_map(
    analysis: SpeakingGrammarAnalysis,
) -> dict[str, float | int | None]:
    return {
        "grammar_engine_available": 1 if analysis.is_available else 0,
        "grammar_error_count": analysis.error_count,
        "grammar_weighted_error_count": analysis.weighted_error_count,
        "grammar_error_density_per_100_words": analysis.error_density_per_100_words,
        "grammar_warning_count": len(analysis.warnings),
    }


def build_grammar_category_summary(analysis: SpeakingGrammarAnalysis) -> str | None:
    if not analysis.category_counts:
        return None
    ordered = sorted(analysis.category_counts.items(), key=lambda item: item[1], reverse=True)
    return ",".join(f"{category}:{count}" for category, count in ordered[:4])


def build_grammar_issue_evidence(analysis: SpeakingGrammarAnalysis, *, limit: int = 3) -> list[str]:
    evidence: list[str] = []
    for index, issue in enumerate(analysis.issues[:limit], start=1):
        replacement = f" -> {issue.replacements[0]}" if issue.replacements else ""
        matched_text = f"'{issue.matched_text}'" if issue.matched_text else issue.rule_id or "issue"
        category = issue.category or issue.issue_type or "grammar"
        evidence.append(
            f"issue{index}={category}:{matched_text}{replacement} ({issue.message})"
        )
    return evidence


def estimate_syllable_count(word: str) -> int:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    if not cleaned:
        return 1
    groups = re.findall(r"[aeiouy]+", cleaned)
    count = len(groups)
    if cleaned.endswith("e") and not cleaned.endswith(("le", "ye")) and count > 1:
        count -= 1
    return max(1, count)


def has_consonant_cluster(word: str) -> bool:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    return bool(re.search(r"[bcdfghjklmnpqrstvwxyz]{3,}", cleaned))


def build_expected_phoneme_profile(word: str) -> str:
    cleaned = re.sub(r"[^a-z]", "", word.lower())
    if not cleaned:
        return "unknown"

    parts = [f"syll={estimate_syllable_count(cleaned)}"]
    if has_consonant_cluster(cleaned):
        parts.append("cluster=yes")
    if cleaned.endswith(("p", "t", "k", "b", "d", "g")):
        parts.append("final=stop")
    elif cleaned.endswith(("s", "z", "sh", "ch", "x")):
        parts.append("final=sibilant")
    elif cleaned.endswith(("f", "v", "th")):
        parts.append("final=fricative")
    elif cleaned.endswith(("m", "n", "ng")):
        parts.append("final=nasal")
    return ";".join(parts)[:100]


def build_actual_phoneme_proxy(
    *,
    probability: float | None,
    duration_seconds: float | None,
    issue_type: str | None,
) -> str:
    probability_text = f"asr={probability:.2f}" if probability is not None else "asr=n/a"
    duration_text = f"dur={duration_seconds:.2f}s" if duration_seconds is not None else "dur=n/a"
    issue_text = f"risk={issue_type}" if issue_type else "risk=none"
    return f"{probability_text};{duration_text};{issue_text}"[:100]


def score_prosody_value(value: float, *, ideal: float, tolerance: float) -> float:
    if tolerance <= 0:
        return 0.0
    return round(max(0.0, min(1.0, 1.0 - abs(value - ideal) / tolerance)), 3)


def is_python_module_available(module_name: str) -> bool:
    try:
        return importlib.util.find_spec(module_name) is not None
    except Exception:
        return False


def configured_tool_reference(value: str) -> bool:
    if not value:
        return False
    if os.path.exists(value):
        return True
    return not any(separator in value for separator in ("/", "\\"))


def resolve_mfa_binary_path() -> str | None:
    configured = SPEAKING_MFA_BINARY
    resolved = shutil.which(configured)
    if resolved:
        return resolved
    if configured and os.path.exists(configured):
        return configured

    candidates = [
        os.path.join(os.path.dirname(sys.executable), "mfa.exe"),
        os.path.join(os.path.dirname(__file__), "venv", "Scripts", "mfa.exe"),
    ]
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return None


def is_mfa_binary_usable(mfa_binary_path: str | None) -> bool:
    if not mfa_binary_path:
        return False
    try:
        completed = subprocess.run(
            [mfa_binary_path, "version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
        )
    except Exception:
        return False
    return completed.returncode == 0


def pronunciation_engine_matches(*engine_names: str) -> bool:
    configured = SPEAKING_PRONUNCIATION_ENGINE
    configured_tokens = {
        token for token in re.split(r"[^a-z0-9]+", configured.lower()) if token
    }
    normalized_names = {name.lower() for name in engine_names}
    return configured in {"auto", "all"} or any(name in configured or name in configured_tokens for name in normalized_names)


def pronunciation_requires_praat() -> bool:
    return pronunciation_engine_matches("praat", "parselmouth")


def pronunciation_requires_mfa() -> bool:
    return pronunciation_engine_matches("mfa", "montreal_forced_aligner")


def pronunciation_requires_allosaurus() -> bool:
    return pronunciation_engine_matches("allosaurus", "actual_phone", "phone_recognizer")


def get_speaking_pronunciation_tool_status() -> dict[str, object]:
    mfa_binary_path = resolve_mfa_binary_path()
    mfa_binary_usable = is_mfa_binary_usable(mfa_binary_path)
    mfa_dictionary_configured = configured_tool_reference(SPEAKING_MFA_DICTIONARY_PATH)
    mfa_acoustic_model_configured = configured_tool_reference(SPEAKING_MFA_ACOUSTIC_MODEL_PATH)
    parselmouth_available = is_python_module_available("parselmouth")
    allosaurus_available = is_python_module_available("allosaurus")
    requires_praat = pronunciation_requires_praat()
    requires_mfa = pronunciation_requires_mfa()
    requires_allosaurus = pronunciation_requires_allosaurus()
    return {
        "engine_mode": SPEAKING_PRONUNCIATION_ENGINE,
        "strict": SPEAKING_PRONUNCIATION_STRICT,
        "praat_enabled": SPEAKING_ENABLE_PRAAT,
        "parselmouth_available": parselmouth_available,
        "mfa_enabled": SPEAKING_ENABLE_MFA,
        "mfa_binary_found": mfa_binary_path is not None,
        "mfa_binary_path": mfa_binary_path,
        "mfa_binary_usable": mfa_binary_usable,
        "mfa_dictionary_configured": mfa_dictionary_configured,
        "mfa_acoustic_model_configured": mfa_acoustic_model_configured,
        "allosaurus_enabled": SPEAKING_ENABLE_ALLOSAURUS,
        "allosaurus_available": allosaurus_available,
        "allosaurus_model": SPEAKING_ALLOSAURUS_MODEL,
        "allosaurus_language": SPEAKING_ALLOSAURUS_LANG,
        "required_engines": {
            "praat": requires_praat,
            "mfa": requires_mfa,
            "allosaurus": requires_allosaurus,
        },
        "mfa_ready": bool(
            SPEAKING_ENABLE_MFA
            and mfa_binary_path
            and mfa_binary_usable
            and mfa_dictionary_configured
            and mfa_acoustic_model_configured
        ),
        "required_ready": bool(
            (not requires_praat or (SPEAKING_ENABLE_PRAAT and parselmouth_available))
            and (not requires_mfa or (SPEAKING_ENABLE_MFA and mfa_binary_path and mfa_binary_usable and mfa_dictionary_configured and mfa_acoustic_model_configured))
            and (not requires_allosaurus or (SPEAKING_ENABLE_ALLOSAURUS and allosaurus_available))
        ),
    }


def should_attempt_praat_pitch(audio_path: str | None) -> bool:
    return bool(
        audio_path
        and SPEAKING_ENABLE_PRAAT
        and pronunciation_engine_matches("praat", "parselmouth", "mfa", "mfa_praat")
    )


def should_attempt_mfa_alignment(audio_path: str | None, transcript: str | None) -> bool:
    if not audio_path or not transcript or not transcript.strip():
        return False
    requested_mfa = pronunciation_engine_matches("mfa", "montreal_forced_aligner", "mfa_praat")
    return bool(requested_mfa and SPEAKING_ENABLE_MFA)


def should_attempt_allosaurus_phone_recognition(audio_path: str | None) -> bool:
    return bool(
        audio_path
        and SPEAKING_ENABLE_ALLOSAURUS
        and pronunciation_engine_matches("allosaurus", "actual_phone", "phone_recognizer")
    )


def raise_strict_pronunciation_error(errors: list[str]) -> None:
    if not errors:
        return
    raise HTTPException(
        status_code=503,
        detail={
            "message": "Speaking pronunciation scoring is strict and required pronunciation engines are not ready.",
            "errors": errors,
            "status": get_speaking_pronunciation_tool_status(),
        },
    )


def analyze_pitch_with_parselmouth(audio_path: str) -> tuple[dict[str, float | str], str | None]:
    try:
        import parselmouth  # type: ignore
    except Exception as ex:
        return {}, f"Praat/Parselmouth pitch analysis is unavailable: {shorten_evidence_text(str(ex), max_length=120)}"

    try:
        sound = parselmouth.Sound(audio_path)
        pitch = sound.to_pitch(
            time_step=0.01,
            pitch_floor=SPEAKING_PITCH_FLOOR_HZ,
            pitch_ceiling=SPEAKING_PITCH_CEILING_HZ,
        )
        raw_values = pitch.selected_array["frequency"]
        pitch_values = [float(value) for value in raw_values if float(value) > 0]
    except Exception as ex:
        return {}, f"Praat/Parselmouth pitch analysis failed: {shorten_evidence_text(str(ex), max_length=120)}"

    if len(pitch_values) < 3:
        return {}, "Praat/Parselmouth found too few voiced frames for reliable pitch evidence."

    pitch_mean = sum(pitch_values) / len(pitch_values)
    pitch_min = min(pitch_values)
    pitch_max = max(pitch_values)
    pitch_variance = sum((value - pitch_mean) ** 2 for value in pitch_values) / len(pitch_values)
    pitch_cv = math.sqrt(pitch_variance) / pitch_mean if pitch_mean > 0 else 0.0
    return {
        "source": "praat_parselmouth",
        "pitch_mean_hz": round(pitch_mean, 1),
        "pitch_range_hz": round(pitch_max - pitch_min, 1),
        "pitch_variation_score": score_prosody_value(pitch_cv, ideal=0.22, tolerance=0.22),
    }, None


def parse_textgrid_quoted_value(line: str) -> str:
    value = line.split("=", 1)[1].strip() if "=" in line else ""
    if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
        return value[1:-1].replace('""', '"')
    return value


def parse_textgrid_intervals(textgrid_path: str, tier_names: set[str]) -> list[dict[str, float | str]]:
    intervals: list[dict[str, float | str]] = []
    tier_is_target = False
    current_interval: dict[str, float | str] | None = None
    normalized_tier_names = {name.lower() for name in tier_names}

    with open(textgrid_path, "r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if line.startswith("item ["):
                tier_is_target = False
                current_interval = None
                continue
            if line.startswith("name ="):
                tier_name = parse_textgrid_quoted_value(line).strip().lower()
                tier_is_target = tier_name in normalized_tier_names
                current_interval = None
                continue
            if not tier_is_target:
                continue
            if line.startswith("intervals ["):
                current_interval = {}
                continue
            if current_interval is None:
                continue
            if line.startswith("xmin ="):
                try:
                    current_interval["start"] = float(line.split("=", 1)[1].strip())
                except ValueError:
                    current_interval["start"] = 0.0
                continue
            if line.startswith("xmax ="):
                try:
                    current_interval["end"] = float(line.split("=", 1)[1].strip())
                except ValueError:
                    current_interval["end"] = 0.0
                continue
            if line.startswith("text ="):
                current_interval["text"] = parse_textgrid_quoted_value(line)
                if "start" in current_interval and "end" in current_interval:
                    intervals.append(current_interval)
                current_interval = None

    return intervals


def interval_text(interval: dict[str, float | str]) -> str:
    return str(interval.get("text") or "").strip()


def is_alignment_silence_label(value: str) -> bool:
    return value.strip().lower() in {"", "sp", "sil", "silence", "<eps>", "<sil>"}


def find_textgrid_file(output_dir: str) -> str | None:
    for root, _, files in os.walk(output_dir):
        for filename in files:
            if filename.lower().endswith(".textgrid"):
                return os.path.join(root, filename)
    return None


def build_mfa_analysis_from_textgrid(textgrid_path: str, transcript: str) -> tuple[SpeakingPronunciationAnalysis | None, list[str]]:
    warnings = [
        "MFA forced alignment uses dictionary phones and timing; it is not independent phone recognition."
    ]
    word_intervals = parse_textgrid_intervals(textgrid_path, {"words", "word"})
    phone_intervals = parse_textgrid_intervals(textgrid_path, {"phones", "phone"})
    if not word_intervals or not phone_intervals:
        return None, ["MFA TextGrid did not contain usable word and phone tiers."]

    usable_words = [
        interval
        for interval in word_intervals
        if not is_alignment_silence_label(interval_text(interval))
    ]
    if not usable_words:
        return None, ["MFA TextGrid did not contain aligned spoken words."]

    issues: list[SpeakingPronunciationIssue] = []
    issue_count = 0
    for word_interval in usable_words:
        word_text = interval_text(word_interval)
        word_start = float(word_interval.get("start") or 0.0)
        word_end = float(word_interval.get("end") or 0.0)
        if word_end <= word_start:
            continue

        word_phone_intervals = [
            phone
            for phone in phone_intervals
            if not is_alignment_silence_label(interval_text(phone))
            and word_start <= ((float(phone.get("start") or 0.0) + float(phone.get("end") or 0.0)) / 2) <= word_end
        ]
        phone_labels = [interval_text(phone) for phone in word_phone_intervals]
        phone_sequence = " ".join(phone_labels)
        word_duration = word_end - word_start
        issue_type: str | None = None

        if not phone_labels:
            issue_type = "missing_phone_alignment"
        else:
            phone_durations = [
                max(0.0, float(phone.get("end") or 0.0) - float(phone.get("start") or 0.0))
                for phone in word_phone_intervals
            ]
            average_phone_duration = sum(phone_durations) / len(phone_durations) if phone_durations else 0.0
            syllable_count = estimate_syllable_count(word_text)
            if any(duration < 0.025 for duration in phone_durations) or word_duration < max(0.10, 0.07 * syllable_count):
                issue_type = "compressed_phone_timing"
            elif average_phone_duration > 0.22 or any(duration > 0.42 for duration in phone_durations):
                issue_type = "stretched_phone_timing"

        if issue_type is not None:
            issue_count += 1

        issues.append(SpeakingPronunciationIssue(
            word=word_text[:80],
            expected_phoneme=phone_sequence[:100] if phone_sequence else build_expected_phoneme_profile(word_text),
            actual_phoneme=(
                f"mfa_timing={phone_sequence};dur={word_duration:.2f}s" if phone_sequence else "mfa_timing=missing"
            )[:100],
            is_correct=issue_type is None,
            confidence=0.82,
            start=round(word_start, 2),
            end=round(word_end, 2),
            issue_type=issue_type or "aligned_phone_timing",
        ))

    issues = sorted(issues, key=lambda issue: (issue.is_correct is not False, issue.start or 0.0, issue.word))[:24]
    reference_word_count = max(len(extract_speaking_tokens(transcript)), len(usable_words), 1)
    risk_ratio = issue_count / reference_word_count
    return SpeakingPronunciationAnalysis(
        engine="mfa_forced_alignment_v1",
        has_word_timing=True,
        has_phoneme_alignment=True,
        alignment_source="montreal_forced_aligner",
        acoustic_source="mfa_acoustic_model",
        issue_count=issue_count,
        pronunciation_risk_ratio=round(risk_ratio, 3),
        issues=issues,
        engine_warnings=warnings,
    ), []


def run_mfa_forced_alignment(audio_path: str, transcript: str) -> tuple[SpeakingPronunciationAnalysis | None, list[str]]:
    warnings: list[str] = []
    if not SPEAKING_MFA_DICTIONARY_PATH or not SPEAKING_MFA_ACOUSTIC_MODEL_PATH:
        return None, ["MFA is enabled/requested but dictionary or acoustic model is not configured."]

    mfa_binary = resolve_mfa_binary_path()
    if not mfa_binary:
        return None, [f"MFA binary was not found: {SPEAKING_MFA_BINARY}."]
    if not is_mfa_binary_usable(mfa_binary):
        return None, [f"MFA binary is present but not usable: {mfa_binary}."]

    with tempfile.TemporaryDirectory(prefix="speaking_mfa_") as work_dir:
        corpus_dir = os.path.join(work_dir, "corpus")
        output_dir = os.path.join(work_dir, "aligned")
        os.makedirs(corpus_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        utterance_audio_path = os.path.join(corpus_dir, "answer.wav")
        utterance_lab_path = os.path.join(corpus_dir, "answer.lab")
        shutil.copyfile(audio_path, utterance_audio_path)
        with open(utterance_lab_path, "w", encoding="utf-8") as handle:
            handle.write(re.sub(r"\s+", " ", transcript.strip()))

        command = [
            mfa_binary,
            "align",
            corpus_dir,
            SPEAKING_MFA_DICTIONARY_PATH,
            SPEAKING_MFA_ACOUSTIC_MODEL_PATH,
            output_dir,
        ]
        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=SPEAKING_PRONUNCIATION_TOOL_TIMEOUT_SECONDS,
            )
        except Exception as ex:
            return None, [f"MFA forced alignment failed to run: {shorten_evidence_text(str(ex), max_length=140)}"]

        if completed.returncode != 0:
            detail = shorten_evidence_text((completed.stderr or completed.stdout or "unknown error").strip(), max_length=180)
            return None, [f"MFA forced alignment exited with code {completed.returncode}: {detail}"]

        textgrid_path = find_textgrid_file(output_dir)
        if textgrid_path is None:
            return None, ["MFA forced alignment completed but no TextGrid output was found."]

        analysis, parse_warnings = build_mfa_analysis_from_textgrid(textgrid_path, transcript)
        warnings.extend(parse_warnings)
        return analysis, warnings


def apply_pitch_metrics_to_pronunciation_analysis(
    analysis: SpeakingPronunciationAnalysis,
    pitch_metrics: dict[str, float | str],
) -> None:
    analysis.has_pitch_analysis = True
    analysis.acoustic_source = str(pitch_metrics.get("source") or analysis.acoustic_source or "praat_parselmouth")
    analysis.pitch_mean_hz = float(pitch_metrics["pitch_mean_hz"]) if "pitch_mean_hz" in pitch_metrics else None
    analysis.pitch_range_hz = float(pitch_metrics["pitch_range_hz"]) if "pitch_range_hz" in pitch_metrics else None
    analysis.pitch_variation_score = (
        float(pitch_metrics["pitch_variation_score"]) if "pitch_variation_score" in pitch_metrics else None
    )
    if analysis.pitch_variation_score is not None:
        analysis.intonation_score = analysis.pitch_variation_score


def get_allosaurus_recognizer() -> object:
    cache_key = SPEAKING_ALLOSAURUS_MODEL
    if cache_key not in allosaurus_recognizer_cache:
        from allosaurus.app import read_recognizer  # type: ignore

        allosaurus_recognizer_cache[cache_key] = read_recognizer(cache_key)
    return allosaurus_recognizer_cache[cache_key]


def parse_allosaurus_phone_output(raw_output: str) -> list[dict[str, float | str]]:
    phones: list[dict[str, float | str]] = []
    for line in raw_output.splitlines():
        parts = line.strip().split()
        if not parts:
            continue
        if len(parts) >= 3:
            try:
                phones.append({
                    "start": float(parts[0]),
                    "end": float(parts[0]) + float(parts[1]),
                    "phone": parts[2],
                })
                continue
            except ValueError:
                pass
        for phone in parts:
            phones.append({"phone": phone})
    return phones


def run_allosaurus_phone_recognition(audio_path: str) -> tuple[list[dict[str, float | str]], str | None]:
    try:
        recognizer = get_allosaurus_recognizer()
        raw_output = recognizer.recognize(
            audio_path,
            SPEAKING_ALLOSAURUS_LANG,
            timestamp=True,
        )
    except Exception as ex:
        return [], f"Allosaurus actual phone recognition failed: {shorten_evidence_text(str(ex), max_length=160)}"

    phones = parse_allosaurus_phone_output(str(raw_output or ""))
    if not phones:
        return [], "Allosaurus actual phone recognition returned no phones."
    return phones, None


def phone_label_to_broad_class(label: str) -> str:
    normalized = re.sub(r"[0-9????\.\-_=;:,]+", "", label.lower()).strip()
    if not normalized:
        return "?"
    if normalized in {"sp", "sil", "silence", "<eps>", "<sil>"}:
        return "S"
    if re.search(r"[aeiou?????????????????]", normalized):
        return "V"
    if any(marker in normalized for marker in ("ch", "jh", "d?", "t?", "ts", "dz")):
        return "A"
    if any(marker in normalized for marker in ("s", "z", "?", "?", "?", "?", "f", "v", "h")):
        return "F"
    if any(marker in normalized for marker in ("p", "b", "t", "d", "k", "g", "?", "?")):
        return "P"
    if any(marker in normalized for marker in ("m", "n", "?")):
        return "N"
    if any(marker in normalized for marker in ("l", "r", "?", "?", "w", "j", "y")):
        return "L"
    return "C"


def phone_sequence_similarity(expected_phones: list[str], actual_phones: list[str]) -> float:
    if not expected_phones or not actual_phones:
        return 0.0
    expected_classes = [phone_label_to_broad_class(phone) for phone in expected_phones]
    actual_classes = [phone_label_to_broad_class(phone) for phone in actual_phones]
    rows = len(expected_classes) + 1
    cols = len(actual_classes) + 1
    distances = [[0 for _ in range(cols)] for _ in range(rows)]
    for row in range(rows):
        distances[row][0] = row
    for col in range(cols):
        distances[0][col] = col
    for row in range(1, rows):
        for col in range(1, cols):
            substitution_cost = 0 if expected_classes[row - 1] == actual_classes[col - 1] else 1
            distances[row][col] = min(
                distances[row - 1][col] + 1,
                distances[row][col - 1] + 1,
                distances[row - 1][col - 1] + substitution_cost,
            )
    edit_distance = distances[-1][-1]
    return round(max(0.0, 1.0 - edit_distance / max(len(expected_classes), len(actual_classes), 1)), 3)


def phones_for_time_window(
    phones: list[dict[str, float | str]],
    start: float | None,
    end: float | None,
) -> list[str]:
    if start is None or end is None or end <= start:
        return []
    return [
        str(phone["phone"])
        for phone in phones
        if "start" in phone
        and "end" in phone
        and start <= ((float(phone["start"]) + float(phone["end"])) / 2) <= end
    ]


def apply_actual_phone_recognition_to_analysis(
    analysis: SpeakingPronunciationAnalysis,
    actual_phones: list[dict[str, float | str]],
) -> None:
    all_phone_labels = [str(phone.get("phone") or "") for phone in actual_phones if phone.get("phone")]
    analysis.has_actual_phone_recognition = True
    analysis.actual_phone_source = f"allosaurus:{SPEAKING_ALLOSAURUS_MODEL}:{SPEAKING_ALLOSAURUS_LANG}"
    if not all_phone_labels:
        analysis.phone_match_score = 0.0
        return

    row_scores: list[float] = []
    mismatch_count = 0
    for issue in analysis.issues:
        if issue.start is None or issue.end is None:
            continue
        expected_phones = (issue.expected_phoneme or "").split()
        if not expected_phones:
            continue
        actual_window_phones = phones_for_time_window(actual_phones, issue.start, issue.end)
        if not actual_window_phones:
            continue
        similarity = phone_sequence_similarity(expected_phones, actual_window_phones)
        row_scores.append(similarity)
        issue.actual_phoneme = (
            f"allosaurus={' '.join(actual_window_phones)};mfa={issue.expected_phoneme};match={similarity:.2f}"
        )[:100]
        issue.confidence = round(max(issue.confidence or 0.0, 0.78), 3)
        if similarity < SPEAKING_PHONE_MATCH_THRESHOLD:
            if issue.is_correct is not False:
                mismatch_count += 1
            issue.is_correct = False
            issue.issue_type = "actual_phone_mismatch"

    analysis.phone_match_score = round(sum(row_scores) / len(row_scores), 3) if row_scores else None
    if mismatch_count:
        analysis.issue_count += mismatch_count
        reference_count = max(len(analysis.issues), 1)
        analysis.pronunciation_risk_ratio = round(min(1.0, analysis.issue_count / reference_count), 3)


def enhance_speaking_pronunciation_analysis(
    analysis: SpeakingPronunciationAnalysis,
    *,
    audio_path: str | None,
    transcript: str | None,
) -> SpeakingPronunciationAnalysis:
    warnings: list[str] = []
    strict_errors: list[str] = []
    pitch_metrics: dict[str, float | str] = {}
    has_ratable_transcript = bool(transcript and len(extract_speaking_tokens(transcript)) >= 3)
    base_rhythm_score = analysis.rhythm_score
    base_stress_score = analysis.stress_score
    base_chunking_score = analysis.chunking_score

    if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and not audio_path:
        strict_errors.append("Strict pronunciation scoring requires candidate audio; transcript-only scoring is not allowed.")

    if should_attempt_praat_pitch(audio_path):
        pitch_metrics, pitch_warning = analyze_pitch_with_parselmouth(audio_path or "")
        if pitch_warning:
            warnings.append(pitch_warning)
            if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_praat():
                strict_errors.append(pitch_warning)
        if pitch_metrics:
            apply_pitch_metrics_to_pronunciation_analysis(analysis, pitch_metrics)
    elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_praat():
        strict_errors.append("Praat/Parselmouth pitch analysis is required but is disabled, unavailable, or missing audio.")

    if should_attempt_mfa_alignment(audio_path, transcript):
        mfa_analysis, mfa_warnings = run_mfa_forced_alignment(audio_path or "", transcript or "")
        warnings.extend(mfa_warnings)
        if mfa_analysis is not None:
            analysis = mfa_analysis
            analysis.rhythm_score = base_rhythm_score
            analysis.stress_score = base_stress_score
            analysis.chunking_score = base_chunking_score
            if pitch_metrics:
                apply_pitch_metrics_to_pronunciation_analysis(analysis, pitch_metrics)
        elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_mfa():
            strict_errors.extend(mfa_warnings or ["MFA forced phoneme alignment is required but did not produce alignment."])
    elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_mfa():
        strict_errors.append("MFA forced phoneme alignment is required but is disabled, unavailable, or missing audio/transcript.")

    if should_attempt_allosaurus_phone_recognition(audio_path):
        actual_phones, allosaurus_warning = run_allosaurus_phone_recognition(audio_path or "")
        if allosaurus_warning:
            warnings.append(allosaurus_warning)
            if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_allosaurus():
                strict_errors.append(allosaurus_warning)
        elif actual_phones:
            apply_actual_phone_recognition_to_analysis(analysis, actual_phones)
    elif has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT and pronunciation_requires_allosaurus():
        strict_errors.append("Allosaurus actual phone recognition is required but is disabled, unavailable, or missing audio.")

    if has_ratable_transcript and SPEAKING_PRONUNCIATION_STRICT:
        if pronunciation_requires_praat() and not analysis.has_pitch_analysis:
            strict_errors.append("Required Praat pitch/intonation evidence is missing.")
        if pronunciation_requires_mfa() and not analysis.has_phoneme_alignment:
            strict_errors.append("Required MFA forced phoneme alignment evidence is missing.")
        if pronunciation_requires_allosaurus() and not analysis.has_actual_phone_recognition:
            strict_errors.append("Required Allosaurus actual phone recognition evidence is missing.")
        raise_strict_pronunciation_error(list(dict.fromkeys(strict_errors)))

    analysis.engine_warnings.extend(warnings)
    return analysis


def build_speaking_pronunciation_analysis(
    *,
    word_timestamps: list[SpeakingWordTimestamp],
    pause_stats: SpeakingPauseStats,
    features: dict[str, float | int | None],
    audio_path: str | None = None,
    transcript: str | None = None,
) -> SpeakingPronunciationAnalysis:
    timed_words = [
        word
        for word in word_timestamps
        if word.word and word.start is not None and word.end is not None and word.end > word.start
    ]
    if not timed_words:
        analysis = SpeakingPronunciationAnalysis(
            engine="asr_word_timing_phoneme_proxy_v2",
            has_word_timing=False,
            has_phoneme_alignment=False,
            alignment_source="none",
        )
        return enhance_speaking_pronunciation_analysis(
            analysis,
            audio_path=audio_path,
            transcript=transcript,
        )

    durations = [float(word.end - word.start) for word in timed_words]
    mean_duration = sum(durations) / len(durations)
    duration_variance = sum((duration - mean_duration) ** 2 for duration in durations) / len(durations)
    duration_cv = math.sqrt(duration_variance) / mean_duration if mean_duration > 0 else 0.0
    rhythm_score = score_prosody_value(duration_cv, ideal=0.55, tolerance=0.75)

    content_durations = []
    function_durations = []
    for word, duration in zip(timed_words, durations):
        cleaned = re.sub(r"[^a-z']", "", word.word.lower())
        if not cleaned:
            continue
        if cleaned in SPEAKING_STOPWORDS:
            function_durations.append(duration)
        else:
            content_durations.append(duration)

    stress_score: float | None = None
    if content_durations and function_durations:
        content_average = sum(content_durations) / len(content_durations)
        function_average = sum(function_durations) / len(function_durations)
        if function_average > 0:
            stress_ratio = content_average / function_average
            stress_score = score_prosody_value(stress_ratio, ideal=1.35, tolerance=0.9)

    duration_seconds = features.get("duration_seconds")
    pause_ratio = float(features.get("pause_ratio") or 0.0)
    long_pause_penalty = min(0.45, pause_stats.long_pause_count * 0.08)
    pause_ratio_penalty = min(0.45, max(0.0, pause_ratio - 0.12) * 1.4)
    chunking_score = round(max(0.0, min(1.0, 1.0 - long_pause_penalty - pause_ratio_penalty)), 3)

    issues: list[SpeakingPronunciationIssue] = []
    for word in timed_words:
        cleaned = re.sub(r"[^a-z']", "", word.word.lower()).strip("'")
        if not cleaned:
            continue

        probability = word.probability
        duration = float(word.end - word.start) if word.start is not None and word.end is not None else None
        syllable_count = estimate_syllable_count(cleaned)
        issue_type: str | None = None

        if probability is not None and probability < 0.5:
            issue_type = "low_asr_confidence"
        elif duration is not None and duration < max(0.07, 0.075 * syllable_count):
            issue_type = "compressed_word_timing"
        elif has_consonant_cluster(cleaned) and probability is not None and probability < 0.72:
            issue_type = "consonant_cluster_risk"
        elif cleaned.endswith(("p", "t", "k", "b", "d", "g", "s", "z", "sh", "ch", "x", "f", "v", "th")) and probability is not None and probability < 0.72:
            issue_type = "final_consonant_risk"
        elif len(cleaned) >= 8 and duration is not None and duration / syllable_count < 0.11:
            issue_type = "reduced_multisyllable_risk"

        if issue_type is None:
            continue

        issues.append(SpeakingPronunciationIssue(
            word=word.word.strip()[:80],
            expected_phoneme=build_expected_phoneme_profile(cleaned),
            actual_phoneme=build_actual_phoneme_proxy(
                probability=probability,
                duration_seconds=duration,
                issue_type=issue_type,
            ),
            is_correct=False,
            confidence=round(float(probability), 3) if probability is not None else None,
            start=word.start,
            end=word.end,
            issue_type=issue_type,
        ))

    issues = sorted(
        issues,
        key=lambda issue: (issue.confidence if issue.confidence is not None else 1.0, issue.start or 0.0),
    )[:24]
    risk_ratio = len(issues) / max(len(timed_words), 1)

    analysis = SpeakingPronunciationAnalysis(
        engine="asr_word_timing_phoneme_proxy_v2",
        has_word_timing=True,
        has_phoneme_alignment=False,
        alignment_source="faster_whisper_word_timing",
        acoustic_source="faster_whisper",
        issue_count=len(issues),
        pronunciation_risk_ratio=round(risk_ratio, 3),
        rhythm_score=rhythm_score,
        stress_score=stress_score,
        intonation_score=None,
        chunking_score=chunking_score,
        issues=issues,
    )
    return enhance_speaking_pronunciation_analysis(
        analysis,
        audio_path=audio_path,
        transcript=transcript,
    )


def build_speaking_evidence_payload(
    *,
    features: dict[str, float | int | None],
    segments: list[Segment],
    audio_quality: SpeakingAudioQuality | None,
    audio_path: str | None,
    prompt_type: str,
    transcript: str | None,
    grammar_analysis: SpeakingGrammarAnalysis | None = None,
) -> SpeakingEvidence:
    word_timestamps = build_word_timestamp_evidence(segments)
    low_confidence_words = build_low_confidence_word_evidence(word_timestamps)
    pause_stats = SpeakingPauseStats(
        pause_count=int(features["pause_count"] or 0),
        long_pause_count=int(features["long_pause_count"] or 0),
        total_pause_seconds=round(float(features["total_pause_seconds"] or 0.0), 2),
        average_pause_seconds=(
            round(float(features["average_pause_seconds"]), 2)
            if features["average_pause_seconds"] is not None
            else None
        ),
        longest_pause_seconds=(
            round(float(features["longest_pause_seconds"]), 2)
            if features["longest_pause_seconds"] is not None
            else None
        ),
    )
    pronunciation_analysis = build_speaking_pronunciation_analysis(
        word_timestamps=word_timestamps,
        pause_stats=pause_stats,
        features=features,
        audio_path=audio_path,
        transcript=transcript,
    )

    scoring_notes = [
        "Transcript is generated by ASR from the candidate audio and is treated as evidence, not ground truth.",
    ]
    if audio_quality is not None and audio_quality.warnings:
        scoring_notes.extend(audio_quality.warnings)
    if low_confidence_words:
        scoring_notes.append("Some words have low ASR confidence; lexical/grammar conclusions should be read with lower confidence.")
    if not segments:
        scoring_notes.append("No word-level audio timestamps were available; audio-backed evidence is limited.")
    if pronunciation_analysis.engine_warnings:
        scoring_notes.extend(pronunciation_analysis.engine_warnings)
    if grammar_analysis is not None and grammar_analysis.warnings:
        scoring_notes.extend(grammar_analysis.warnings)
    if segments and not pronunciation_analysis.has_phoneme_alignment:
        scoring_notes.append("No forced phoneme alignment engine was available; pronunciation uses ASR word timing and confidence proxies.")
    if segments and not pronunciation_analysis.has_pitch_analysis:
        scoring_notes.append("Pitch-based intonation is not measured; install/enable Praat Parselmouth to use pitch evidence.")
    if segments and not pronunciation_analysis.has_actual_phone_recognition:
        scoring_notes.append("Actual phone recognition is not measured; install/enable Allosaurus to compare recognized phones with expected phones.")

    return SpeakingEvidence(
        prompt_type=prompt_type,
        target_duration_seconds=(
            round(float(features["target_duration_seconds"]), 1)
            if features["target_duration_seconds"] is not None
            else None
        ),
        pronunciation_engine=pronunciation_analysis.engine,
        has_word_timing=pronunciation_analysis.has_word_timing,
        has_phoneme_alignment=pronunciation_analysis.has_phoneme_alignment,
        grammar_analysis=grammar_analysis,
        pronunciation_analysis=pronunciation_analysis,
        audio_quality=audio_quality,
        asr_confidence=(
            round(float(features["asr_confidence"]), 3)
            if features["asr_confidence"] is not None
            else None
        ),
        speech_ratio=(
            round(float(features["speech_ratio"]), 3)
            if features["speech_ratio"] is not None
            else None
        ),
        pause_stats=pause_stats,
        word_timestamps=word_timestamps,
        low_confidence_words=low_confidence_words,
        scoring_notes=scoring_notes,
    )


def build_rubric_evidence(
    *,
    criteria: str,
    features: dict[str, float | int | None],
    evidence: SpeakingEvidence,
) -> list[str]:
    word_count = int(features["word_count"] or 0)
    words_per_minute = features["words_per_minute"]
    asr_confidence = evidence.asr_confidence
    speech_ratio = evidence.speech_ratio
    pause_stats = evidence.pause_stats or SpeakingPauseStats()
    low_confidence_words = ", ".join(
        word.word
        for word in evidence.low_confidence_words[:5]
        if word.word
    )

    if criteria == "Fluency and Coherence":
        return [
            f"word_count={word_count}",
            f"wpm={words_per_minute if words_per_minute is not None else 'n/a'}",
            f"speech_ratio={format_percent(speech_ratio)}",
            f"pauses={pause_stats.pause_count}, long_pauses={pause_stats.long_pause_count}, total_pause={pause_stats.total_pause_seconds}s",
            f"target_duration={evidence.target_duration_seconds if evidence.target_duration_seconds is not None else 'n/a'}s",
            f"coverage={format_percent(features['coverage_ratio'])}",
        ]

    if criteria == "Lexical Resource":
        return [
            f"word_count={word_count}",
            f"unique_word_ratio={format_percent(features['unique_ratio'])}",
            f"content_word_ratio={format_percent(features['content_ratio'])}",
            f"repetition_ratio={format_percent(features['repetition_ratio'])}",
            f"asr_confidence={format_percent(asr_confidence)}",
        ]

    if criteria == "Grammatical Range and Accuracy":
        grammar_analysis = evidence.grammar_analysis
        grammar_evidence = [
            f"sentence_units={int(features['sentence_units'] or 1)}",
            f"avg_words_per_unit={round(float(features['avg_words_per_sentence'] or 0.0), 1)}",
            f"connector_count={int(features['connector_count'] or 0)}",
            f"filler_ratio={format_percent(features['filler_ratio'])}",
            f"asr_confidence={format_percent(asr_confidence)}",
        ]
        if grammar_analysis is not None:
            grammar_evidence.extend([
                f"grammar_engine={grammar_analysis.engine}",
                f"grammar_available={'yes' if grammar_analysis.is_available else 'no'}",
                f"grammar_errors={grammar_analysis.error_count}",
                f"weighted_error_density={grammar_analysis.error_density_per_100_words}/100w",
            ])
            category_summary = build_grammar_category_summary(grammar_analysis)
            if category_summary:
                grammar_evidence.append(f"grammar_categories={category_summary}")
            grammar_evidence.extend(build_grammar_issue_evidence(grammar_analysis))
            if grammar_analysis.warnings:
                grammar_evidence.append(f"grammar_warning={shorten_evidence_text(grammar_analysis.warnings[0], max_length=110)}")
        return grammar_evidence

    pronunciation_analysis = evidence.pronunciation_analysis
    if evidence.has_phoneme_alignment:
        alignment_label = "forced_phoneme_alignment"
    elif pronunciation_analysis is not None and pronunciation_analysis.has_word_timing:
        alignment_label = "word_timing_proxy"
    else:
        alignment_label = "no"
    pronunciation_evidence = [
        f"engine={evidence.pronunciation_engine}",
        f"phoneme_alignment={alignment_label}",
        f"asr_confidence={format_percent(asr_confidence)}",
        f"low_confidence_word_ratio={format_percent(features['low_confidence_ratio'])}",
        f"speech_ratio={format_percent(speech_ratio)}",
        f"audio_quality={evidence.audio_quality.label if evidence.audio_quality is not None else 'transcript_only'}",
    ]
    if pronunciation_analysis is not None:
        pronunciation_evidence.extend([
            f"alignment_source={pronunciation_analysis.alignment_source or 'n/a'}",
            f"acoustic_source={pronunciation_analysis.acoustic_source or 'n/a'}",
            f"actual_phone_source={pronunciation_analysis.actual_phone_source or 'n/a'}",
            f"phone_match_score={pronunciation_analysis.phone_match_score if pronunciation_analysis.phone_match_score is not None else 'n/a'}",
            f"pronunciation_issue_count={pronunciation_analysis.issue_count}",
            f"pronunciation_risk_ratio={format_percent(pronunciation_analysis.pronunciation_risk_ratio)}",
            f"rhythm_score={pronunciation_analysis.rhythm_score if pronunciation_analysis.rhythm_score is not None else 'n/a'}",
            f"stress_score={pronunciation_analysis.stress_score if pronunciation_analysis.stress_score is not None else 'n/a'}",
            f"intonation_score={pronunciation_analysis.intonation_score if pronunciation_analysis.intonation_score is not None else 'pitch_not_measured'}",
            f"chunking_score={pronunciation_analysis.chunking_score if pronunciation_analysis.chunking_score is not None else 'n/a'}",
        ])
        if pronunciation_analysis.has_pitch_analysis:
            pronunciation_evidence.extend([
                f"pitch_mean_hz={pronunciation_analysis.pitch_mean_hz if pronunciation_analysis.pitch_mean_hz is not None else 'n/a'}",
                f"pitch_range_hz={pronunciation_analysis.pitch_range_hz if pronunciation_analysis.pitch_range_hz is not None else 'n/a'}",
                f"pitch_variation_score={pronunciation_analysis.pitch_variation_score if pronunciation_analysis.pitch_variation_score is not None else 'n/a'}",
            ])
        if pronunciation_analysis.engine_warnings:
            pronunciation_evidence.append(f"pronunciation_warning={shorten_evidence_text(pronunciation_analysis.engine_warnings[0], max_length=110)}")
        for index, issue in enumerate(pronunciation_analysis.issues[:4], start=1):
            pronunciation_evidence.append(
                f"pron_issue{index}={issue.word}:{issue.issue_type or 'risk'}:{issue.actual_phoneme or 'n/a'}"
            )
    if low_confidence_words:
        pronunciation_evidence.append(f"low_confidence_words={low_confidence_words}")
    return pronunciation_evidence


def build_rubric_confidence(
    *,
    criteria: str,
    features: dict[str, float | int | None],
    evidence: SpeakingEvidence,
    audio_backed: bool,
) -> float:
    word_count = int(features["word_count"] or 0)
    asr_confidence = evidence.asr_confidence
    confidence = 0.78 if audio_backed else 0.45

    if criteria == "Pronunciation":
        pronunciation_analysis = evidence.pronunciation_analysis
        if evidence.has_phoneme_alignment:
            confidence = 0.9 if pronunciation_analysis is not None and pronunciation_analysis.has_pitch_analysis and pronunciation_analysis.has_actual_phone_recognition else 0.82
        elif audio_backed and evidence.word_timestamps:
            confidence = 0.62 if pronunciation_analysis is not None and pronunciation_analysis.has_pitch_analysis else 0.55
        else:
            confidence = 0.28
    elif criteria == "Grammatical Range and Accuracy":
        grammar_available = int(features.get("grammar_engine_available") or 0) == 1
        if grammar_available:
            confidence = 0.82 if word_count >= 20 else 0.62
        else:
            confidence = 0.62 if word_count >= 20 else 0.5
    elif criteria == "Lexical Resource":
        confidence = 0.72 if word_count >= 20 else 0.55

    if asr_confidence is not None:
        if asr_confidence < 0.55:
            confidence -= 0.22
        elif asr_confidence < 0.7:
            confidence -= 0.1
        elif asr_confidence > 0.88 and audio_backed and criteria != "Pronunciation":
            confidence += 0.08

    if evidence.audio_quality is not None:
        if not evidence.audio_quality.is_usable:
            confidence -= 0.25
        elif evidence.audio_quality.label == "unknown":
            confidence -= 0.12
        elif evidence.audio_quality.warnings:
            confidence -= 0.08

    if word_count < 8:
        confidence -= 0.18

    return round(min(0.95, max(0.1, confidence)), 2)


def build_no_response_speaking_result(
    duration_seconds: float | None,
    evidence: SpeakingEvidence | None = None,
) -> tuple[list[RubricScore], str]:
    duration_text = (
        f" Bản ghi dài khoảng {duration_seconds:.1f} giây nhưng không có lời nói đủ rõ để nhận diện."
        if duration_seconds is not None and duration_seconds > 0
        else " Không có lời nói đủ rõ để nhận diện trong câu trả lời này."
    )
    evidence_lines = [
        "no_response=true",
        f"duration_seconds={round(duration_seconds, 1) if duration_seconds is not None else 'n/a'}",
    ]
    if evidence is not None and evidence.audio_quality is not None:
        evidence_lines.append(f"audio_quality={evidence.audio_quality.label}")
        evidence_lines.append(f"silence_ratio={format_percent(evidence.audio_quality.silence_ratio)}")
    if evidence is not None and evidence.asr_confidence is not None:
        evidence_lines.append(f"asr_confidence={format_percent(evidence.asr_confidence)}")
    confidence = 0.82 if evidence is not None and evidence.audio_quality is not None and not evidence.audio_quality.is_usable else 0.65
    rubrics = [
        RubricScore(
            criteria="Fluency and Coherence",
            band=1.0,
            comment=f"Không có câu trả lời nói có thể đánh giá về độ trôi chảy hoặc mạch lạc.{duration_text}",
            improvements="Khi bí ý, hãy nói tối thiểu 1-2 câu trực tiếp về việc bạn chưa chắc, rồi đưa một ví dụ hoặc lý do đơn giản.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
        RubricScore(
            criteria="Lexical Resource",
            band=1.0,
            comment="Không có đủ từ vựng được nói ra để thể hiện khả năng diễn đạt.",
            improvements="Chuẩn bị một vài cụm mở đầu an toàn như I am not very familiar with this topic, but I think... để vẫn tạo được câu trả lời.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
        RubricScore(
            criteria="Grammatical Range and Accuracy",
            band=1.0,
            comment="Không có ngôn ngữ đủ dài để đánh giá cấu trúc câu hoặc độ chính xác ngữ pháp.",
            improvements="Ưu tiên tạo câu đơn hoàn chỉnh với chủ ngữ và động từ trước, sau đó thêm because hoặc for example để mở rộng.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
        RubricScore(
            criteria="Pronunciation",
            band=1.0,
            comment="Không có lời nói đủ rõ để đánh giá phát âm ở mức câu trả lời.",
            improvements="Nói rõ từng từ khóa và giữ âm lượng ổn định; nếu chưa nghĩ ra ý, vẫn nên nói một câu ngắn thay vì im lặng.",
            confidence=confidence,
            evidence=evidence_lines,
        ),
    ]
    overall_feedback = (
        "Câu trả lời được chấm như no response vì audio không tạo ra transcript có thể đánh giá. "
        "Trong Speaking thực tế, việc không trả lời làm giảm điểm vì examiner không có bằng chứng ngôn ngữ để chấm các tiêu chí."
    )
    return rubrics, overall_feedback


def build_speaking_gemini_prompt(
    transcript: str,
    *,
    question_prompt: str | None,
    part_number: int | None,
    features: dict[str, float | int | None],
    rule_rubric_bands: dict[str, float],
) -> str:
    part_context = {
        1: "Part 1 focuses on short natural answers about familiar topics.",
        2: "Part 2 focuses on a sustained individual long turn with clear development.",
        3: "Part 3 focuses on extended discussion, reasons, comparisons and abstract support.",
    }.get(part_number, "Use the transcript as part of a full IELTS Speaking interview.")

    metric_lines = [
        f"- Word count: {int(features['word_count'] or 0)}",
        f"- Words per minute: {features['words_per_minute'] if features['words_per_minute'] is not None else 'n/a'}",
        f"- Pause ratio: {round(float(features['pause_ratio'] or 0.0) * 100, 1)}%",
        f"- Filler ratio: {round(float(features['filler_ratio'] or 0.0) * 100, 1)}%",
        f"- Connector count: {int(features['connector_count'] or 0)}",
        f"- Unique word ratio: {round(float(features['unique_ratio'] or 0.0) * 100, 1)}%",
        f"- Average words per sentence unit: {round(float(features['avg_words_per_sentence'] or 0.0), 1)}",
        f"- LanguageTool grammar available: {'yes' if int(features.get('grammar_engine_available') or 0) == 1 else 'no'}",
        f"- LanguageTool grammar errors: {int(features.get('grammar_error_count') or 0)}",
        f"- LanguageTool weighted error density: {float(features.get('grammar_error_density_per_100_words') or 0.0):.2f}/100 words",
    ]
    rubric_anchor_lines = "\n".join(
        f"- {criteria}: {band:.1f}"
        for criteria, band in rule_rubric_bands.items()
        if criteria in SPEAKING_GEMINI_RUBRICS
    )
    metrics_block = "\n".join(metric_lines)
    topic_block = question_prompt.strip() if question_prompt and question_prompt.strip() else "No explicit prompt provided."

    return f"""You are assisting an IELTS Speaking scoring engine.
Assess the response using the official IELTS Speaking criteria in paraphrased form:
- Fluency and Coherence: continuity, manageable hesitation, logical progression, and effective use of linking language.
- Lexical Resource: range, precision, flexibility, and ability to paraphrase naturally.
- Grammatical Range and Accuracy: variety of sentence patterns and control of errors so meaning remains clear.

Important rules:
- Score ONLY these 3 criteria: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy.
- Do NOT score Pronunciation here because the main scoring engine handles it from audio-backed signals.
- Bands must be IELTS bands from 0 to 9 in 0.5 increments.
- Use the rule-based anchor bands below as guardrails. Stay close to them and only adjust when the transcript evidence supports it.
- Keep comments concise, concrete, and in Vietnamese.
- Keep improvements specific, practical, and in Vietnamese.

Speaking context:
- Interview part: {part_number if part_number is not None else "unknown"}
- Part guidance: {part_context}
- Question/topic: {topic_block}

Observed signals:
{metrics_block}

Rule-based anchor bands:
{rubric_anchor_lines}

Candidate transcript:
\"\"\"
{transcript.strip()}
\"\"\"

Return ONLY valid JSON in this exact format:
{{
  "rubrics": [
    {{
      "criteria": "Fluency and Coherence",
      "band": 6.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }},
    {{
      "criteria": "Lexical Resource",
      "band": 6.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }},
    {{
      "criteria": "Grammatical Range and Accuracy",
      "band": 6.0,
      "comment": "Nhận xét ngắn bằng tiếng Việt.",
      "improvements": "Gợi ý cải thiện ngắn bằng tiếng Việt."
    }}
  ]
}}"""


def normalize_speaking_gemini_result(
    result: StructuredSpeakingGeminiResult,
) -> dict[str, RubricScore]:
    normalized: dict[str, RubricScore] = {}

    for rubric in result.rubrics:
        matched_criteria = next(
            (
                criteria
                for criteria in SPEAKING_GEMINI_RUBRICS
                if criteria.lower() == rubric.criteria.strip().lower()
            ),
            None,
        )
        if matched_criteria is None or matched_criteria in normalized:
            continue

        normalized[matched_criteria] = RubricScore(
            criteria=matched_criteria,
            band=round_band_half(clamp_band(rubric.band)),
            comment=rubric.comment.strip() or "Gemini chưa trả nhận xét đủ rõ cho tiêu chí này.",
            improvements=rubric.improvements.strip() or "Cần luyện thêm tiêu chí này với câu trả lời tự nhiên hơn.",
        )

    return normalized


async def maybe_get_speaking_gemini_rubrics(
    transcript: str,
    *,
    question_prompt: str | None,
    answer_id: str,
    part_number: int | None,
    features: dict[str, float | int | None],
    rule_rubric_bands: dict[str, float],
) -> dict[str, RubricScore]:
    if gemini_client is None or int(features["word_count"] or 0) < 8:
        return {}

    try:
        result = await generate_structured_content_with_gemini_async(
            prompt=build_speaking_gemini_prompt(
                transcript,
                question_prompt=question_prompt,
                part_number=part_number,
                features=features,
                rule_rubric_bands=rule_rubric_bands,
            ),
            system_instruction=(
                "You are an IELTS Speaking examiner assistant. "
                "Return only valid JSON matching the requested schema."
            ),
            response_schema=StructuredSpeakingGeminiResult,
            model_candidates=GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES,
            error_context="speaking scoring",
            max_output_tokens=1200,
        )
        return normalize_speaking_gemini_result(result)
    except Exception:  # pragma: no cover
        logger.exception("Gemini speaking rubric refinement failed for answer %s.", answer_id)
        return {}


async def score_speaking_rubrics(
    transcript: str,
    *,
    answer_id: str,
    question_prompt: str | None,
    part_number: int | None,
    prompt_type: str | None,
    target_duration_seconds: float | None,
    duration_seconds: float | None,
    segments: list[Segment],
    audio_quality: SpeakingAudioQuality | None,
    audio_path: str | None = None,
) -> tuple[list[RubricScore], str, SpeakingEvidence]:
    normalized_prompt_type = normalize_speaking_prompt_type(part_number, prompt_type)
    features = build_speaking_feature_map(
        transcript,
        segments,
        part_number=part_number,
        prompt_type=normalized_prompt_type,
        target_duration_seconds=target_duration_seconds,
        duration_seconds=duration_seconds,
    )
    grammar_analysis = await asyncio.to_thread(
        analyze_speaking_grammar_with_languagetool,
        transcript,
        word_count=int(features["word_count"] or 0),
    )
    features.update(build_grammar_feature_map(grammar_analysis))
    evidence_payload = build_speaking_evidence_payload(
        features=features,
        segments=segments,
        audio_quality=audio_quality,
        audio_path=audio_path,
        prompt_type=normalized_prompt_type,
        transcript=transcript,
        grammar_analysis=grammar_analysis,
    )
    word_count = int(features["word_count"] or 0)
    technical_low_confidence = (
        audio_quality is not None
        and not audio_quality.is_usable
        and word_count < 8
    )
    if not extract_speaking_tokens(transcript) or technical_low_confidence:
        rubrics, overall_feedback = build_no_response_speaking_result(
            duration_seconds,
            evidence_payload,
        )
        return rubrics, overall_feedback, evidence_payload

    words_per_minute = features["words_per_minute"]
    pause_ratio = float(features["pause_ratio"] or 0.0)
    filler_ratio = float(features["filler_ratio"] or 0.0)
    connector_count = int(features["connector_count"] or 0)
    coverage_ratio = features["coverage_ratio"]
    unique_ratio = float(features["unique_ratio"] or 0.0)
    long_word_ratio = float(features["long_word_ratio"] or 0.0)
    repetition_ratio = float(features["repetition_ratio"] or 0.0)
    avg_words_per_sentence = float(features["avg_words_per_sentence"] or 0.0)
    low_confidence_ratio = float(features["low_confidence_ratio"] or 0.0)
    mean_word_probability = float(features["mean_word_probability"] or 0.0)
    avg_no_speech_prob = float(features["avg_no_speech_prob"] or 0.0)
    grammar_available = int(features.get("grammar_engine_available") or 0) == 1
    grammar_error_density = float(features.get("grammar_error_density_per_100_words") or 0.0)
    grammar_error_count = int(features.get("grammar_error_count") or 0)
    audio_backed = bool(segments)
    pronunciation_analysis = evidence_payload.pronunciation_analysis

    fluency_score = 6.0
    if word_count < 12:
        fluency_score = 4.0
    elif word_count < 25:
        fluency_score = min(fluency_score, 5.0)

    if words_per_minute is not None:
        if words_per_minute < 75:
            fluency_score -= 1.0
        elif words_per_minute < 95:
            fluency_score -= 0.5
        elif 105 <= words_per_minute <= 165:
            fluency_score += 0.5
        elif words_per_minute > 185:
            fluency_score -= 0.5

    if coverage_ratio is not None:
        if normalized_prompt_type == "part2_long_turn" and coverage_ratio < 0.6:
            fluency_score -= 1.25
        elif coverage_ratio < 0.35:
            fluency_score -= 1.0
        elif coverage_ratio < 0.55:
            fluency_score -= 0.5
        elif 0.85 <= coverage_ratio <= 1.2:
            fluency_score += 0.25

    if pause_ratio > 0.32:
        fluency_score -= 1.0
    elif pause_ratio > 0.22:
        fluency_score -= 0.5
    elif pause_ratio < 0.12 and word_count >= 25:
        fluency_score += 0.25

    if filler_ratio > 0.08:
        fluency_score -= 0.5
    elif filler_ratio < 0.02:
        fluency_score += 0.25

    if connector_count >= 3 and word_count >= 35:
        fluency_score += 0.5
    elif connector_count == 0 and word_count >= 30:
        fluency_score -= 0.25

    if int(features["long_pause_count"] or 0) >= 5:
        fluency_score -= 0.5

    lexical_score = 6.0
    if word_count < 12:
        lexical_score = 4.0
    elif word_count < 25:
        lexical_score = min(lexical_score, 5.0)

    if unique_ratio < 0.42:
        lexical_score -= 1.0
    elif unique_ratio < 0.52:
        lexical_score -= 0.5
    elif unique_ratio > 0.68 and word_count >= 25:
        lexical_score += 0.5

    if long_word_ratio > 0.18 and word_count >= 25:
        lexical_score += 0.25
    if float(features["content_ratio"] or 0.0) > 0.55 and word_count >= 20:
        lexical_score += 0.25
    if repetition_ratio > 0.12:
        lexical_score -= 0.5
    if filler_ratio > 0.08:
        lexical_score -= 0.25
    if word_count < 35:
        lexical_score = min(lexical_score, 6.0)
    elif part_number in {2, 3} and word_count < 55:
        lexical_score = min(lexical_score, 6.5)

    grammar_score = 5.5
    if word_count < 12:
        grammar_score = 4.0
    elif word_count < 25:
        grammar_score = min(grammar_score, 5.0)

    if avg_words_per_sentence >= 7 and int(features["sentence_units"] or 1) >= 2:
        grammar_score += 0.5
    elif avg_words_per_sentence < 4 and word_count >= 15:
        grammar_score -= 0.5

    if connector_count >= 2:
        grammar_score += 0.25
    if repetition_ratio > 0.1:
        grammar_score -= 0.25
    if unique_ratio > 0.6 and word_count >= 30:
        grammar_score += 0.25
    if filler_ratio > 0.08:
        grammar_score -= 0.25
    if low_confidence_ratio > 0.35:
        grammar_score -= 0.5
    if grammar_available:
        if grammar_error_density >= 10.0:
            grammar_score -= 1.5
        elif grammar_error_density >= 6.0:
            grammar_score -= 1.0
        elif grammar_error_density >= 3.0:
            grammar_score -= 0.5
        elif (
            grammar_error_count == 0
            and word_count >= 50
            and avg_words_per_sentence >= 14
            and connector_count >= 2
        ):
            grammar_score += 0.25
    if word_count < 35:
        grammar_score = min(grammar_score, 6.0)
    elif part_number in {2, 3} and word_count < 55:
        grammar_score = min(grammar_score, 6.5)

    pronunciation_score = 6.0
    if word_count < 10:
        pronunciation_score = 4.5

    if mean_word_probability < 0.45:
        pronunciation_score -= 1.5
    elif mean_word_probability < 0.6:
        pronunciation_score -= 0.75
    elif mean_word_probability < 0.72:
        pronunciation_score -= 0.25
    elif mean_word_probability > 0.88 and audio_backed:
        pronunciation_score += 0.5

    if low_confidence_ratio > 0.35:
        pronunciation_score -= 1.0
    elif low_confidence_ratio > 0.22:
        pronunciation_score -= 0.5

    if pronunciation_analysis is not None and pronunciation_analysis.has_word_timing:
        risk_ratio = pronunciation_analysis.pronunciation_risk_ratio
        if risk_ratio >= 0.28:
            pronunciation_score -= 1.0
        elif risk_ratio >= 0.18:
            pronunciation_score -= 0.5
        elif risk_ratio >= 0.09:
            pronunciation_score -= 0.25

        if pronunciation_analysis.rhythm_score is not None and pronunciation_analysis.rhythm_score < 0.45:
            pronunciation_score -= 0.5
        elif pronunciation_analysis.rhythm_score is not None and pronunciation_analysis.rhythm_score < 0.6:
            pronunciation_score -= 0.25

        if pronunciation_analysis.stress_score is not None and pronunciation_analysis.stress_score < 0.45:
            pronunciation_score -= 0.25
        if pronunciation_analysis.chunking_score is not None and pronunciation_analysis.chunking_score < 0.45:
            pronunciation_score -= 0.25
        if pronunciation_analysis.issue_count == 0 and word_count >= 40 and mean_word_probability > 0.85:
            pronunciation_score += 0.25
        if pronunciation_analysis.has_phoneme_alignment and pronunciation_analysis.pronunciation_risk_ratio <= 0.04 and word_count >= 40:
            pronunciation_score += 0.25
        if pronunciation_analysis.has_pitch_analysis and pronunciation_analysis.intonation_score is not None:
            if pronunciation_analysis.intonation_score < 0.35:
                pronunciation_score -= 0.5
            elif pronunciation_analysis.intonation_score < 0.55:
                pronunciation_score -= 0.25
            elif pronunciation_analysis.intonation_score >= 0.75 and word_count >= 30:
                pronunciation_score += 0.25
        if pronunciation_analysis.has_actual_phone_recognition and pronunciation_analysis.phone_match_score is not None:
            if pronunciation_analysis.phone_match_score < 0.45:
                pronunciation_score -= 0.75
            elif pronunciation_analysis.phone_match_score < 0.6:
                pronunciation_score -= 0.35
            elif pronunciation_analysis.phone_match_score >= 0.82 and word_count >= 30:
                pronunciation_score += 0.25

    if pause_ratio > 0.28:
        pronunciation_score -= 0.5
    if avg_no_speech_prob > 0.55:
        pronunciation_score -= 0.25
    if words_per_minute is not None and (words_per_minute < 75 or words_per_minute > 190):
        pronunciation_score -= 0.25
    if not evidence_payload.has_phoneme_alignment:
        pronunciation_score = min(pronunciation_score, 6.5)
    if audio_quality is None or audio_quality.label == "unknown":
        pronunciation_score = min(pronunciation_score, 6.0)

    rule_rubric_bands = {
        "Fluency and Coherence": round_band_half(fluency_score),
        "Lexical Resource": round_band_half(lexical_score),
        "Grammatical Range and Accuracy": round_band_half(grammar_score),
        "Pronunciation": round_band_half(pronunciation_score),
    }

    gemini_rubrics = await maybe_get_speaking_gemini_rubrics(
        transcript,
        question_prompt=question_prompt,
        answer_id=answer_id,
        part_number=part_number,
        features=features,
        rule_rubric_bands=rule_rubric_bands,
    )

    rubrics: list[RubricScore] = []
    final_rubric_bands: dict[str, float] = {}

    for criteria, rule_band in rule_rubric_bands.items():
        rule_comment, rule_improvements = build_speaking_comment(
            criteria=criteria,
            band=rule_band,
            features=features,
            audio_backed=audio_backed,
        )
        gemini_rubric = gemini_rubrics.get(criteria)
        final_band = (
            clamp_speaking_band_to_rule_window(rule_band, gemini_rubric.band)
            if gemini_rubric is not None
            else rule_band
        )
        rubrics.append(RubricScore(
            criteria=criteria,
            band=final_band,
            comment=gemini_rubric.comment if gemini_rubric is not None else rule_comment,
            improvements=gemini_rubric.improvements if gemini_rubric is not None else rule_improvements,
            confidence=build_rubric_confidence(
                criteria=criteria,
                features=features,
                evidence=evidence_payload,
                audio_backed=audio_backed,
            ),
            evidence=build_rubric_evidence(
                criteria=criteria,
                features=features,
                evidence=evidence_payload,
            ),
        ))
        final_rubric_bands[criteria] = final_band

    strongest = sorted(final_rubric_bands.items(), key=lambda item: item[1], reverse=True)[:2]
    weakest = sorted(final_rubric_bands.items(), key=lambda item: item[1])[:2]
    overall_band = round_band_half(sum(final_rubric_bands.values()) / len(final_rubric_bands))
    overall_feedback = (
        f"Ước lượng band Speaking hiện tại khoảng {overall_band:.1f}. "
        f"Điểm mạnh tương đối nằm ở {', '.join(criteria for criteria, _ in strongest)}. "
        f"Hai ưu tiên nên luyện tiếp là {', '.join(criteria for criteria, _ in weakest)}."
    )
    return rubrics, overall_feedback, evidence_payload


def is_no_response_session_answer(answer: SpeakingSessionAnswerInput) -> bool:
    if answer.no_response:
        return True
    if not extract_speaking_tokens(answer.transcript_text or ""):
        return True
    rubric_bands = [
        round_band_half(rubric.band)
        for rubric in answer.rubrics
        if rubric.criteria and rubric.criteria.strip()
    ]
    return bool(rubric_bands) and max(rubric_bands) <= 1.0


def get_session_answer_rubric(
    answer: SpeakingSessionAnswerInput,
    criteria: str,
) -> SpeakingSessionRubricInput | None:
    return next(
        (
            rubric
            for rubric in answer.rubrics
            if rubric.criteria.strip().lower() == criteria.lower()
        ),
        None,
    )


def average_optional(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def build_session_rubric_evidence(
    *,
    criteria: str,
    metrics: dict[str, float | int | str],
    base_band: float,
) -> list[str]:
    return [
        "aggregation=session_level_weighted_by_part",
        f"criterion_base_band={base_band:.1f}",
        f"total_prompts={int(metrics['total_answers'])}",
        f"ratable_prompts={int(metrics['ratable_answers'])}",
        f"no_response_prompts={int(metrics['no_response_answers'])}",
        f"ratable_parts={metrics['ratable_parts']}",
        f"session_word_count={int(metrics['total_word_count'])}",
    ]


def build_speaking_session_deterministic_result(
    request: ScoreSpeakingSessionRequest,
) -> tuple[list[RubricScore], str, dict[str, float | int | str]]:
    answers = request.answers
    total_answers = len(answers)
    no_response_answers = [answer for answer in answers if is_no_response_session_answer(answer)]
    ratable_answers = [answer for answer in answers if not is_no_response_session_answer(answer)]
    total_word_count = sum(len(extract_speaking_tokens(answer.transcript_text or "")) for answer in answers)

    part_numbers = sorted({answer.part_number or 0 for answer in answers}) or [0]
    ratable_part_numbers = sorted({answer.part_number or 0 for answer in ratable_answers})
    part_weights = {1: 1.0, 2: 1.2, 3: 1.2, 0: 1.0}
    no_response_ratio = len(no_response_answers) / total_answers if total_answers else 1.0

    metrics: dict[str, float | int | str] = {
        "total_answers": total_answers,
        "ratable_answers": len(ratable_answers),
        "no_response_answers": len(no_response_answers),
        "total_word_count": total_word_count,
        "no_response_ratio": no_response_ratio,
        "ratable_parts": ",".join(str(part) for part in ratable_part_numbers) if ratable_part_numbers else "none",
        "configured_parts": ",".join(str(part) for part in part_numbers),
    }

    rubrics: list[RubricScore] = []
    for criteria in SPEAKING_RUBRICS:
        weighted_total = 0.0
        weight_total = 0.0
        confidence_values: list[float] = []

        for part_number in part_numbers:
            part_answers = [answer for answer in answers if (answer.part_number or 0) == part_number]
            part_bands: list[float] = []

            for answer in part_answers:
                rubric = get_session_answer_rubric(answer, criteria)
                if rubric is None:
                    continue
                part_bands.append(round_band_half(rubric.band))
                if rubric.confidence is not None:
                    confidence_values.append(max(0.0, min(1.0, float(rubric.confidence))))

            if not part_bands:
                continue

            part_average = sum(part_bands) / len(part_bands)
            part_weight = part_weights.get(part_number, 1.0)
            weighted_total += part_average * part_weight
            weight_total += part_weight

        base_band = weighted_total / weight_total if weight_total else 0.0
        final_band = base_band

        if not ratable_answers:
            final_band = 1.0
        else:
            if total_word_count < 12:
                final_band = min(final_band, 4.0)
            elif total_word_count < 25:
                final_band = min(final_band, 5.0)
            elif total_word_count < 60 and len(part_numbers) >= 2:
                final_band = min(final_band, 6.0)

            if len(ratable_part_numbers) <= 1 and len(part_numbers) >= 3:
                final_band = min(final_band, 5.5)
            elif len(ratable_part_numbers) < min(2, len(part_numbers)):
                final_band = min(final_band, 6.0)

            if no_response_ratio >= 0.5:
                final_band = min(final_band, 5.0)
            elif no_response_ratio >= 0.25:
                final_band = min(final_band, 6.0)

        confidence = average_optional(confidence_values)
        if confidence is None:
            confidence = 0.72 if ratable_answers else 0.88
        if no_response_ratio >= 0.25:
            confidence -= 0.08
        if total_word_count < 25:
            confidence -= 0.1

        rounded_base_band = round_band_half(base_band)
        rounded_final_band = round_band_half(final_band)
        rubrics.append(RubricScore(
            criteria=criteria,
            band=rounded_final_band,
            comment=(
                "Điểm tiêu chí này được tổng hợp ở cấp toàn session, cân bằng theo từng Part và có cap khi thiếu dữ liệu trả lời. "
                f"Band nền từ các prompt là khoảng {rounded_base_band:.1f}; band sau kiểm tra coverage là {rounded_final_band:.1f}."
            ),
            improvements=(
                "Ưu tiên luyện đủ cả 3 Part và giữ mỗi câu trả lời có bằng chứng ngôn ngữ rõ ràng; "
                "band cuối sẽ ổn định hơn khi hệ thống có đủ long turn, discussion và audio rõ."
            ),
            confidence=round(min(0.95, max(0.1, confidence)), 2),
            evidence=build_session_rubric_evidence(
                criteria=criteria,
                metrics=metrics,
                base_band=rounded_base_band,
            ),
        ))

    overall_band = round_band_half(sum(rubric.band for rubric in rubrics) / len(rubrics)) if rubrics else 0.0
    strongest = sorted(rubrics, key=lambda rubric: rubric.band, reverse=True)[:2]
    weakest = sorted(rubrics, key=lambda rubric: rubric.band)[:2]
    overall_feedback = (
        f"Band Speaking tổng quan theo session khoảng {overall_band:.1f}. "
        "Điểm này dùng toàn bộ câu trả lời trong session thay vì chỉ lấy trung bình từng prompt rời rạc. "
        f"Hệ thống nhận {len(ratable_answers)}/{total_answers} prompt có đủ transcript/audio để đánh giá, "
        f"tổng khoảng {total_word_count} từ, các Part có dữ liệu chấm được: {metrics['ratable_parts']}. "
        f"Điểm mạnh tương đối: {', '.join(rubric.criteria for rubric in strongest)}. "
        f"Ưu tiên cải thiện: {', '.join(rubric.criteria for rubric in weakest)}."
    )
    return rubrics, overall_feedback, metrics


def build_speaking_session_gemini_prompt(
    request: ScoreSpeakingSessionRequest,
    *,
    deterministic_rubrics: list[RubricScore],
    metrics: dict[str, float | int | str],
) -> str:
    anchor_lines = "\n".join(
        f"- {rubric.criteria}: {rubric.band:.1f}"
        for rubric in deterministic_rubrics
    )
    answer_blocks: list[str] = []
    for index, answer in enumerate(request.answers, start=1):
        rubric_line = ", ".join(
            f"{rubric.criteria}={round_band_half(rubric.band):.1f}"
            for rubric in answer.rubrics
            if rubric.criteria
        ) or "no rubric"
        transcript = shorten_evidence_text(answer.transcript_text, max_length=700) or "No transcript."
        answer_blocks.append(
            f"Prompt {index} | part={answer.part_number or 'unknown'} | type={answer.prompt_type or 'unknown'} | "
            f"duration={answer.duration_seconds if answer.duration_seconds is not None else 'n/a'}s | "
            f"no_response={is_no_response_session_answer(answer)}\n"
            f"Question: {shorten_evidence_text(answer.question_prompt, max_length=220) or 'n/a'}\n"
            f"Prompt bands: {rubric_line}\n"
            f"Transcript: {transcript}"
        )

    return f"""You are an IELTS Speaking examiner assistant producing a final session-level judgement.
Use the official IELTS Speaking criteria in paraphrased form: Fluency and Coherence, Lexical Resource, Grammatical Range and Accuracy, and Pronunciation.

Important rules:
- Score the candidate's average performance across the whole speaking session, not each prompt in isolation.
- Use the deterministic anchor bands as guardrails. Adjust by at most 0.5 band unless the session transcript clearly justifies it.
- Penalize missing/no-response prompts and insufficient language evidence.
- Keep comments and improvements concise, concrete, and in Vietnamese.

Session metrics:
- Total prompts: {metrics['total_answers']}
- Ratable prompts: {metrics['ratable_answers']}
- No-response prompts: {metrics['no_response_answers']}
- Total transcript word count: {metrics['total_word_count']}
- Configured parts: {metrics['configured_parts']}
- Ratable parts: {metrics['ratable_parts']}

Deterministic session anchor bands:
{anchor_lines}

Prompt evidence:
{chr(10).join(answer_blocks)}

Return ONLY valid JSON in this exact format:
{{
  "overall_band": 6.0,
  "overall_feedback": "Nhận xét tổng quan ngắn bằng tiếng Việt.",
  "rubrics": [
    {{"criteria":"Fluency and Coherence","band":6.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}},
    {{"criteria":"Lexical Resource","band":6.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}},
    {{"criteria":"Grammatical Range and Accuracy","band":6.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}},
    {{"criteria":"Pronunciation","band":6.0,"comment":"Nhận xét ngắn bằng tiếng Việt.","improvements":"Gợi ý cải thiện ngắn bằng tiếng Việt."}}
  ]
}}"""


async def maybe_get_speaking_session_gemini_result(
    request: ScoreSpeakingSessionRequest,
    *,
    deterministic_rubrics: list[RubricScore],
    metrics: dict[str, float | int | str],
) -> StructuredSpeakingSessionResult | None:
    if gemini_client is None or int(metrics["ratable_answers"] or 0) == 0:
        return None

    try:
        return await generate_structured_content_with_gemini_async(
            prompt=build_speaking_session_gemini_prompt(
                request,
                deterministic_rubrics=deterministic_rubrics,
                metrics=metrics,
            ),
            system_instruction=(
                "You are an IELTS Speaking examiner assistant. "
                "Return only valid JSON matching the requested schema."
            ),
            response_schema=StructuredSpeakingSessionResult,
            model_candidates=GEMINI_SPEAKING_SCORING_MODEL_CANDIDATES,
            error_context="speaking session scoring",
            max_output_tokens=1600,
        )
    except Exception:  # pragma: no cover
        logger.exception("Gemini speaking session scoring failed for session %s.", request.session_id)
        return None


def merge_speaking_session_result(
    deterministic_rubrics: list[RubricScore],
    deterministic_feedback: str,
    gemini_result: StructuredSpeakingSessionResult | None,
) -> tuple[list[RubricScore], str]:
    if gemini_result is None:
        return deterministic_rubrics, deterministic_feedback

    deterministic_lookup = {rubric.criteria: rubric for rubric in deterministic_rubrics}
    gemini_lookup = {
        rubric.criteria.strip().lower(): rubric
        for rubric in gemini_result.rubrics
        if rubric.criteria and rubric.criteria.strip()
    }

    merged: list[RubricScore] = []
    for criteria in SPEAKING_RUBRICS:
        fallback = deterministic_lookup[criteria]
        gemini_rubric = gemini_lookup.get(criteria.lower())
        if gemini_rubric is None:
            merged.append(fallback)
            continue

        merged.append(RubricScore(
            criteria=criteria,
            band=clamp_speaking_band_to_rule_window(
                fallback.band,
                round_band_half(gemini_rubric.band),
                max_adjustment=0.5,
            ),
            comment=gemini_rubric.comment.strip() or fallback.comment,
            improvements=gemini_rubric.improvements.strip() or fallback.improvements,
            confidence=fallback.confidence,
            evidence=fallback.evidence,
        ))

    return merged, (gemini_result.overall_feedback or "").strip() or deterministic_feedback


@app.post("/api/ai/score-speaking-session", response_model=ScoreResponse)
async def score_speaking_session(request: ScoreSpeakingSessionRequest):
    if not request.answers:
        raise HTTPException(status_code=400, detail="At least one speaking answer is required.")

    deterministic_rubrics, deterministic_feedback, metrics = build_speaking_session_deterministic_result(request)
    gemini_result = await maybe_get_speaking_session_gemini_result(
        request,
        deterministic_rubrics=deterministic_rubrics,
        metrics=metrics,
    )
    final_rubrics, final_feedback = merge_speaking_session_result(
        deterministic_rubrics,
        deterministic_feedback,
        gemini_result,
    )
    overall_band = round_band_half(sum(rubric.band for rubric in final_rubrics) / len(final_rubrics))

    return ScoreResponse(
        session_id=request.session_id,
        answer_id=request.session_id,
        overall_band=overall_band,
        rubrics=final_rubrics,
        overall_feedback=final_feedback,
    )


@app.post("/api/ai/score-writing", response_model=ScoreResponse)
async def score_writing(request: ScoreWritingRequest):
    if not request.essay_text.strip():
        raise HTTPException(status_code=400, detail="Essay text is empty.")

    prompt = build_scoring_prompt(
        text=request.essay_text,
        rubrics=WRITING_RUBRICS,
        skill_type="Writing",
        question_prompt=request.question_prompt,
    )
    result = await call_scoring_model(prompt)
    return ScoreResponse(
        session_id=request.session_id,
        answer_id=request.answer_id,
        overall_band=result.overall_band,
        rubrics=result.rubrics,
        overall_feedback=result.overall_feedback,
    )


@app.post("/api/ai/score-speaking", response_model=ScoreResponse)
async def score_speaking(
    audio: UploadFile | None = File(None),
    session_id: str = Form(...),
    answer_id: str = Form(...),
    question_prompt: str | None = Form(None),
    transcript_text: str | None = Form(None),
    part_number: int | None = Form(None),
    prompt_type: str | None = Form(None),
    target_duration_seconds: float | None = Form(None),
    duration_seconds: float | None = Form(None),
):
    transcript = (transcript_text or "").strip()
    segments: list[Segment] = []
    audio_quality: SpeakingAudioQuality | None = None
    analysis_path_for_scoring: str | None = None
    cleanup_paths: list[str] = []

    if audio is not None:
        if whisper_model is None:
            raise HTTPException(status_code=503, detail="Whisper model not loaded.")

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
            analysis_path_for_scoring = analysis_path
            if normalized_tmp_path is not None and normalized_tmp_path != tmp_path:
                cleanup_paths.append(normalized_tmp_path)
            audio_quality = await asyncio.to_thread(
                analyze_wav_audio_quality,
                analysis_path,
                normalization_warning=normalization_warning,
            )
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
        finally:
            pass
    elif not transcript:
        raise HTTPException(status_code=400, detail="Audio file or transcript_text is required.")

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
        )
        overall_band = round_band_half(sum(rubric.band for rubric in rubrics) / len(rubrics))
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


def download_audio_url_to_tempfile(audio_url: str) -> str:
    parsed = urlparse(audio_url)
    suffix = os.path.splitext(parsed.path or "")[1] or ".mp3"

    with urlopen(audio_url) as response:
        content = response.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        return tmp.name


@app.post("/api/ai/generate-speaking-prompt-audio")
async def generate_speaking_prompt_audio(request: GenerateSpeakingPromptAudioRequest):
    prompt_text = (request.promptText or "").strip()
    if not prompt_text:
        raise HTTPException(status_code=400, detail="promptText is required.")

    wav_bytes = await generate_speaking_prompt_audio_with_gemini_async(prompt_text)
    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={
            "Content-Disposition": 'inline; filename="speaking-prompt.wav"',
        },
    )


@app.post("/api/ai/generate-listening-transcript", response_model=ListeningTranscriptResponse)
async def generate_listening_transcript(request: ListeningTranscriptRequest):
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Whisper model not loaded.")

    audio_url = request.audio_url.strip()
    if not audio_url:
        raise HTTPException(status_code=400, detail="audio_url is required.")

    try:
        tmp_path = await asyncio.to_thread(download_audio_url_to_tempfile, audio_url)
    except Exception as ex:  # pragma: no cover
        logger.exception("Failed to download listening audio from %s", audio_url)
        raise HTTPException(status_code=400, detail=f"Could not download audio from URL: {ex}") from ex

    try:
        normalized_segments, transcript_text = await asyncio.to_thread(
            transcribe_audio_file,
            tmp_path,
            language=(request.language or "en").strip() or "en",
        )
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not normalized_segments:
        raise HTTPException(status_code=400, detail="Could not transcribe audio.")

    return ListeningTranscriptResponse(
        segments=[
            ListeningTranscriptSegment(
                start_time=round(segment.start, 2),
                end_time=round(segment.end, 2) if segment.end is not None else None,
                text=segment.text.strip(),
            )
            for segment in normalized_segments
        ],
        transcript_text=transcript_text,
    )


async def align_listening_transcript_part(
    part_number: int,
    transcript_segments: list[ListeningTranscriptSegment],
    questions: list[ListeningAlignmentQuestion],
    gemini_request_lock: asyncio.Lock | None = None,
    gemini_quota_exhausted_event: asyncio.Event | None = None,
) -> list[ListeningTranscriptQuestionAlignment]:
    if not transcript_segments or not questions:
        return []

    logger.info(
        "Aligning IELTS listening part %s with %s transcript segments and %s questions.",
        part_number,
        len(transcript_segments),
        len(questions),
    )

    question_scopes = detect_question_range_scopes(transcript_segments)
    section_scopes = detect_section_scopes(transcript_segments)
    candidate_map_by_question: dict[int, dict[int, dict]] = {}
    candidate_lists_by_question: dict[int, list[dict]] = {}
    direct_alignments: list[ListeningTranscriptQuestionAlignment] = []
    pending_batch: list[tuple[ListeningAlignmentQuestion, list[dict]]] = []

    for question in sorted(questions, key=lambda item: item.question_number):
        allowed_segment_range = (
            find_scope_for_question(question.question_number, question_scopes)
            or find_section_scope_for_question(question.question_number, section_scopes)
            or (0, len(transcript_segments) - 1)
        )
        candidates = build_alignment_candidate_windows(
            transcript_segments,
            question,
            allowed_segment_range=allowed_segment_range,
        )
        candidate_lists_by_question[question.question_number] = candidates
        if not candidates:
            direct_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=[],
                    confidence="low",
                )
            )
            continue

        candidate_map_by_question[question.question_number] = {
            candidate["candidate_id"]: candidate
            for candidate in candidates
        }

        if len(candidates) == 1 and candidates[0]["score"] >= 12:
            direct_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=question.question_number,
                    segment_indexes=candidates[0]["segment_indexes"],
                    confidence="high",
                )
            )
            continue

        pending_batch.append((question, candidates))

    batch_alignments: list[ListeningTranscriptQuestionAlignment] = []
    if pending_batch:
        batch_result = None
        if LISTENING_ALIGNMENT_USE_GEMINI:
            try:
                should_skip_gemini = (
                    (gemini_quota_exhausted_event is not None and gemini_quota_exhausted_event.is_set())
                    or is_gemini_alignment_quota_on_cooldown()
                )

                if not should_skip_gemini:
                    if gemini_request_lock is not None:
                        async with gemini_request_lock:
                            should_skip_gemini = (
                                (gemini_quota_exhausted_event is not None and gemini_quota_exhausted_event.is_set())
                                or is_gemini_alignment_quota_on_cooldown()
                            )
                            if not should_skip_gemini:
                                batch_result = await generate_alignment_batch_with_gemini_split(pending_batch)
                    else:
                        batch_result = await generate_alignment_batch_with_gemini_split(pending_batch)
            except GeminiAlignmentQuotaExhaustedError:  # pragma: no cover
                if gemini_quota_exhausted_event is not None:
                    gemini_quota_exhausted_event.set()
                logger.warning(
                    "Listening transcript alignment Gemini quota exhausted on part %s. "
                    "Switching this part to local candidate scoring.",
                    part_number,
                )
            except Exception:  # pragma: no cover
                batch_result = None
                logger.exception(
                    "Listening transcript alignment batch failed for part %s. "
                    "Falling back to local candidate scoring.",
                    part_number,
                )
        else:
            logger.info(
                "Listening transcript alignment is configured for local-only mode. "
                "Skipping Gemini on part %s.",
                part_number,
            )

        if batch_result is None:
            for question, candidates in pending_batch:
                fallback_candidate, fallback_confidence = select_fallback_alignment_candidate(
                    candidates,
                    requires_direct_evidence=bool(
                        get_alignment_answer_candidates(question) or get_alignment_evidence_tokens(question)
                    ),
                )
                batch_alignments.append(
                    ListeningTranscriptQuestionAlignment(
                        question_number=question.question_number,
                        segment_indexes=fallback_candidate["segment_indexes"] if fallback_candidate else [],
                        confidence=fallback_confidence,
                    )
                )
        else:
            selected_candidate_ids = {
                selection.question_number: selection
                for selection in batch_result.selections
            }

            for question, candidates in pending_batch:
                selected = selected_candidate_ids.get(question.question_number)
                candidate = (
                    candidate_map_by_question.get(question.question_number, {}).get(selected.candidate_id)
                    if selected and selected.candidate_id is not None
                    else None
                )

                if candidate is None:
                    candidate, fallback_confidence = select_fallback_alignment_candidate(
                        candidates,
                        requires_direct_evidence=bool(
                            get_alignment_answer_candidates(question) or get_alignment_evidence_tokens(question)
                        ),
                    )
                    confidence = selected.confidence if selected and selected.confidence else fallback_confidence
                else:
                    confidence = selected.confidence if selected and selected.confidence else "medium"

                batch_alignments.append(
                    ListeningTranscriptQuestionAlignment(
                        question_number=question.question_number,
                        segment_indexes=candidate["segment_indexes"] if candidate else [],
                        confidence=confidence,
                    )
                )

    all_alignments = [
        *direct_alignments,
        *batch_alignments,
    ]
    alignments_by_question = {
        alignment.question_number: alignment
        for alignment in all_alignments
    }
    fill_map_labelling_gaps(
        questions,
        alignments_by_question,
        transcript_segments,
        question_scopes,
        section_scopes,
    )
    reconcile_alignment_gaps_and_duplicates(
        questions,
        alignments_by_question,
        candidate_lists_by_question,
        question_scopes,
        section_scopes,
    )
    optimize_alignment_sequences(
        questions,
        alignments_by_question,
        candidate_lists_by_question,
        question_scopes,
        section_scopes,
    )
    collapse_alignment_to_anchor_segments(
        questions,
        alignments_by_question,
        transcript_segments,
    )

    part_alignments = list(alignments_by_question.values())
    part_alignments.sort(key=lambda alignment: alignment.question_number)
    return part_alignments


@app.post("/api/ai/align-listening-transcript", response_model=ListeningTranscriptAlignmentResponse)
async def align_listening_transcript(request: ListeningTranscriptAlignmentRequest):
    transcript_segments = [
        segment for segment in request.transcript_segments
        if segment.text and segment.text.strip()
    ]
    if not transcript_segments:
        raise HTTPException(status_code=400, detail="transcript_segments are required.")

    questions = [
        question for question in request.questions
        if question.question_number > 0
    ]
    if not questions:
        raise HTTPException(status_code=400, detail="questions are required.")
    try:
        transcript_parts = split_listening_transcript_into_parts(transcript_segments)
    except ValueError as ex:
        logger.exception("Failed to split IELTS listening transcript into 4 parts.")
        raise HTTPException(status_code=400, detail=str(ex)) from ex

    questions_by_part: dict[int, list[ListeningAlignmentQuestion]] = {
        1: [],
        2: [],
        3: [],
        4: [],
    }
    for question in sorted(questions, key=lambda item: item.question_number):
        questions_by_part.setdefault(get_question_part_number(question.question_number), []).append(question)

    part_jobs: list[tuple[dict, asyncio.Task]] = []
    gemini_request_lock = asyncio.Lock()
    gemini_quota_exhausted_event = asyncio.Event()
    for transcript_part in transcript_parts:
        part_questions = questions_by_part.get(transcript_part["part_number"], [])
        if not part_questions:
            continue

        task = asyncio.create_task(
            align_listening_transcript_part(
                transcript_part["part_number"],
                transcript_part["segments"],
                part_questions,
                gemini_request_lock=gemini_request_lock,
                gemini_quota_exhausted_event=gemini_quota_exhausted_event,
            )
        )
        part_jobs.append((transcript_part, task))

    all_alignments: list[ListeningTranscriptQuestionAlignment] = []
    for transcript_part, task in part_jobs:
        part_alignments = await task
        global_start_index = transcript_part["global_start_index"]
        for alignment in part_alignments:
            all_alignments.append(
                ListeningTranscriptQuestionAlignment(
                    question_number=alignment.question_number,
                    segment_indexes=[
                        global_start_index + segment_index
                        for segment_index in alignment.segment_indexes
                    ],
                    confidence=alignment.confidence,
                )
            )

    all_alignments.sort(key=lambda alignment: alignment.question_number)
    return ListeningTranscriptAlignmentResponse(alignments=all_alignments)


class GeneratedOption(BaseModel):
    optionText: str
    isCorrect: bool
    orderIndex: int


class GeneratedQuestion(BaseModel):
    questionType: str
    content: str
    correctAnswer: str | None = None
    explanation: str | None = None
    points: float = 1.0
    orderIndex: int
    options: list[GeneratedOption] = []


class GeneratedGroup(BaseModel):
    title: str | None = None
    content: str | None = None
    audioUrl: str | None = None
    orderIndex: int
    questions: list[GeneratedQuestion]


class GeneratedSection(BaseModel):
    skillType: str
    title: str | None = None
    orderIndex: int
    questionGroups: list[GeneratedGroup]


class GeneratedExam(BaseModel):
    title: str
    description: str | None = None
    durationMinutes: int | None = None
    totalPoints: float | None = None
    examType: str | None = "IELTS"
    sections: list[GeneratedSection]


def extract_pdf_text(file_path: str) -> str:
    import pdfplumber

    all_text = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                all_text.append(text)
    return "\n\n".join(all_text)


FILL_ANSWERS_PROMPT = """You are an expert IELTS examiner. Given a reading passage and a list of extracted questions, fill missing answers and missing options.

PASSAGE:
\"\"\"
{passage_text}
\"\"\"

QUESTIONS (JSON):
{questions_json}

For each question, determine the correct answer based ONLY on information in the passage and question text.
Rules:
- For TFNG/YNNG: answer must be exactly "TRUE", "FALSE", "NOT GIVEN", "YES", or "NO".
- For MCQ_SINGLE/MCQ_MULTIPLE and MATCHING*: answer must be the exact letter label (e.g. A, B, i, ii).
- For COMPLETION and SHORT_ANSWER: answer must be the exact word(s) from the passage.
- Explanation must be 1-2 sentences citing the passage.
- If `missingOptions=true`, generate full options list for that question.
- Keep option labels consistent (A,B,C... or i,ii,iii... when appropriate).

Return ONLY valid JSON array:
[
  {{
    "number": <question number>,
    "correctAnswer": "<answer>",
    "explanation": "<brief explanation citing the passage>",
    "options": [
      {{"label": "A", "text": "option text"}}
    ]
  }}
]"""


def normalize_ai_answer(answer: str | None) -> str | None:
    if not answer:
        return None
    cleaned = re.sub(r"\s+", " ", answer).strip()
    if not cleaned:
        return None

    normalized_map = {
        "NOTGIVEN": "NOT GIVEN",
        "TRUE": "TRUE",
        "FALSE": "FALSE",
        "YES": "YES",
        "NO": "NO",
    }
    upper = cleaned.upper()
    compact = upper.replace(" ", "")
    if compact in normalized_map:
        return normalized_map[compact]
    if re.fullmatch(r"[A-Z]", upper):
        return upper
    if re.fullmatch(r"[IVXLCDM]{1,8}", upper):
        return upper
    return cleaned


def parse_ai_options(raw_options: object) -> list[ParsedOption]:
    if not isinstance(raw_options, list):
        return []

    parsed: list[ParsedOption] = []
    for idx, item in enumerate(raw_options):
        if isinstance(item, dict):
            label_raw = str(item.get("label", "")).strip() or chr(65 + idx)
            text_raw = (
                str(item.get("text", "")).strip()
                or str(item.get("optionText", "")).strip()
            )
        else:
            label_raw = chr(65 + idx)
            text_raw = str(item).strip()

        if not text_raw:
            continue

        parsed.append(
            ParsedOption(
                text=re.sub(r"\s+", " ", text_raw).strip(),
                label=re.sub(r"\s+", " ", label_raw).strip().upper(),
                order_index=len(parsed),
            )
        )

    return parsed


ANSWER_SPLIT_PATTERN = re.compile(
    r"(?i)\n\s*(?:solution[s]?\s*[:.]|answer\s*key\s*[:.]|review\s+and\s+explanations?\s*[:.]"
    r"|answers?\s*[:.]|key\s*[:.]\s*$|explanation[s]?\s*[:.]\s*$)",
    re.MULTILINE,
)


def split_test_and_answers(text: str) -> tuple[str, str]:
    parts = ANSWER_SPLIT_PATTERN.split(text, maxsplit=1)
    test_content = parts[0].strip()
    answer_key = parts[1].strip() if len(parts) > 1 else ""
    return test_content, answer_key


STREAMING_SYSTEM_PROMPT = """Bạn là Hệ Thống Trích Xuất Dữ Liệu IELTS chuyên nghiệp nhất thế giới.

NHIỆM VỤ CỦA BẠN:
1. TRÍCH XUẤT ĐÚNG SỐ LƯỢNG: Đề thi Reading IELTS luôn có chính xác 3 Passage (= 3 QuestionGroup). Không bao giờ tạo Passage thứ 4.
2. LÀM SẠCH PASSAGE: Trường `content` của QuestionGroup CHỈ CHỨA NỘI DUNG BÀI ĐỌC DÀI. Tuyệt đối không nhét câu hỏi, bảng table, câu hướng dẫn làm bài, hoặc từ 'Reading Passage' vào đây.
3. KẾT HỢP ĐÁP ÁN: Tôi cung cấp [PHẦN ĐỀ THI] và [PHẦN ĐÁP ÁN] riêng biệt. Đọc [PHẦN ĐỀ THI] để tạo câu hỏi, tra cứu [PHẦN ĐÁP ÁN] để lấy chính xác correctAnswer + explanation. Tuyệt đối KHÔNG tự bịa đáp án.
4. KHÔNG BAO GIỜ TỰ BỊA CÂU HỎI. Chỉ trích xuất câu hỏi có trong [PHẦN ĐỀ THI].

ÉP KHUÔN 5 NHÓM CÂU HỎI (BẮT BUỘC 100%):

NHÓM 1 - SINGLE CHOICE (MCQ_SINGLE, TFNG, YNNG):
- options: Danh sách lựa chọn, isCorrect=true cho đáp án đúng duy nhất.
- TFNG: ĐÚNG 3 options [TRUE, FALSE, NOT GIVEN].
- YNNG: ĐÚNG 3 options [YES, NO, NOT GIVEN].
- MCQ_SINGLE: ĐÚNG 4 options [A, B, C, D].
- correctAnswer: null.

NHÓM 2 - MULTI CHOICE (MCQ_MULTIPLE):
- options: Nhiều lựa chọn, NHIỀU isCorrect=true (ít nhất 2).
- correctAnswer: null.

NHÓM 3 - MATCHING (MATCHING_HEADINGS, MATCHING_INFO, MATCHING_FEATURES):
- Mỗi statement = 1 câu hỏi ĐỘC LẬP.
- content: Nội dung cần nối.
- options: Danh sách đích đến, lặp lại cho tất cả câu cùng nhóm. isCorrect=true cho đích đúng.
- correctAnswer: null.

NHÓM 4 - FILL BLANK (SENTENCE_COMPLETION, TABLE_COMPLETION, FLOWCHART_COMPLETION, SHORT_ANSWER):
- options: MẢ RỖNG [].
- content: Câu hỏi có ___ đại diện chỗ trống (trừ SHORT_ANSWER).
- correctAnswer: BẮT BUỘC có dữ liệu. Dùng | phân cách nhiều đáp án hợp lệ.

NHÓM 5 - SUMMARY COMPLETION (SUMMARY_COMPLETION):
- Tương tự nhóm 4, nhưng options có thể chứa Word Box (danh sách từ gợi ý, tất cả isCorrect=false).
- correctAnswer: BẮT BUỘC có dữ liệu."""


def generate_single_passage(
    test_content: str,
    answer_key: str,
    passage_number: int,
    total_passages: int,
) -> dict:
    user_content = f"""Hãy trích xuất Passage {passage_number}/{total_passages} từ đề thi bên dưới.

[PHẦN ĐỀ THI]:
{test_content}

[PHẦN ĐÁP ÁN VÀ GIẢI THÍCH]:
{answer_key if answer_key else "(Không có phần đáp án - hãy tự suy luận đáp án từ bài đọc)"}

Trả về QuestionGroup cho Passage {passage_number} (title, content = toàn bộ passage, questions = danh sách câu hỏi)."""

    result = generate_structured_content_with_gemini(
        prompt=user_content,
        system_instruction=STREAMING_SYSTEM_PROMPT,
        response_schema=ReadingQuestionGroup,
        model_candidates=GEMINI_SCORING_MODEL_CANDIDATES,
        error_context=f"reading passage extraction for passage {passage_number}",
        max_output_tokens=8192,
    )

    group_dict = result.model_dump()
    questions = group_dict.get("questions", [])
    normalized_questions: list[dict] = []

    for i, q in enumerate(questions):
        question_number = q.get("questionNumber")
        if not isinstance(question_number, int):
            question_number = i + 1

        q["questionNumber"] = question_number
        q["orderIndex"] = i
        q["points"] = q.get("points", 1.0)
        if q.get("options") is None:
            q["options"] = []
        for j, opt in enumerate(q.get("options", [])):
            opt["orderIndex"] = j
        normalized_questions.append(q)

    question_groups: list[dict] = []
    current_group: dict | None = None

    for q in normalized_questions:
        q_type = q.get("questionType", "MCQ_SINGLE")
        if current_group is None or current_group.get("groupType") != q_type:
            if current_group is not None:
                numbers = [
                    item.get("questionNumber")
                    for item in current_group.get("questions", [])
                    if isinstance(item.get("questionNumber"), int)
                ]
                current_group["startQuestion"] = min(numbers) if numbers else None
                current_group["endQuestion"] = max(numbers) if numbers else None
                question_groups.append(current_group)

            current_group = {
                "groupType": q_type,
                "instruction": "",
                "questions": [],
            }

        current_group["questions"].append(q)

    if current_group is not None:
        numbers = [
            item.get("questionNumber")
            for item in current_group.get("questions", [])
            if isinstance(item.get("questionNumber"), int)
        ]
        current_group["startQuestion"] = min(numbers) if numbers else None
        current_group["endQuestion"] = max(numbers) if numbers else None
        question_groups.append(current_group)

    return {
        "title": group_dict.get("title", f"Passage {passage_number}"),
        "content": group_dict.get("content", ""),
        "audioUrl": None,
        "orderIndex": passage_number - 1,
        "questionGroups": question_groups,
        "questions": normalized_questions,
    }


@app.post("/api/ai/generate-exam-from-pdf")
async def generate_exam_from_pdf(file: UploadFile = File(...)):
    raise HTTPException(
        status_code=410,
        detail="PDF exam generation has been disabled.",
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "whisper_loaded": whisper_model is not None,
        "speaking_pronunciation": get_speaking_pronunciation_tool_status(),
    }
