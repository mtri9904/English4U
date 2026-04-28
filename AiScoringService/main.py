import asyncio
import base64
import io
import json
import logging
import math
import os
import re
import tempfile
import time
import unicodedata
import wave
from collections import Counter
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Literal, TypeVar
from urllib.parse import urlparse
from urllib.request import urlopen

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
GEMINI_SPEAKING_SCORING_MODEL = os.getenv("GEMINI_SPEAKING_SCORING_MODEL", "gemini-3-flash-preview").strip()
GEMINI_SPEAKING_SCORING_FALLBACK_MODELS = [
    model.strip()
    for model in os.getenv("GEMINI_SPEAKING_SCORING_FALLBACK_MODELS", "gemini-3-pro-preview").split(",")
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

whisper_model: WhisperModel | None = None
gemini_client: google_genai.Client | None = None
gemini_alignment_quota_cooldown_until = 0.0

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


class ScoreResponse(BaseModel):
    session_id: str
    answer_id: str
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None
    transcript_text: str | None = None


class StructuredScoreResult(BaseModel):
    overall_band: float
    rubrics: list[RubricScore]
    overall_feedback: str | None = None


class StructuredSpeakingGeminiResult(BaseModel):
    rubrics: list[RubricScore]


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

    last_error: Exception | None = None
    for model_name in model_candidates:
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=google_genai_types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=response_schema,
                    temperature=temperature,
                    candidate_count=1,
                    max_output_tokens=max_output_tokens,
                ),
            )
            if isinstance(response.parsed, response_schema):
                return response.parsed

            if isinstance(response.text, str) and response.text.strip():
                return response_schema.model_validate_json(response.text)

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


def get_speaking_target_duration_seconds(part_number: int | None) -> float | None:
    if part_number == 1:
        return 45.0
    if part_number == 2:
        return 120.0
    if part_number == 3:
        return 90.0
    return None


def extract_speaking_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def count_phrase_occurrences(text: str, phrases: tuple[str, ...]) -> int:
    normalized = f" {re.sub(r'\\s+', ' ', text.lower()).strip()} "
    return sum(normalized.count(f" {phrase} ") for phrase in phrases)


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


def build_speaking_feature_map(
    transcript: str,
    segments: list[Segment],
    *,
    part_number: int | None,
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

    flat_words: list[Word] = [
        word
        for segment in segments
        for word in (segment.words or [])
        if word.word and word.word.strip()
    ]

    if flat_words:
        mean_word_probability = sum(word.probability for word in flat_words) / len(flat_words)
        low_confidence_ratio = (
            sum(1 for word in flat_words if word.probability < 0.55) / len(flat_words)
        )
        pauses = [
            max(0.0, current.start - previous.end)
            for previous, current in zip(flat_words, flat_words[1:])
        ]
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
        pauses = [
            max(0.0, current.start - previous.end)
            for previous, current in zip(segments, segments[1:])
            if current.start is not None and previous.end is not None
        ]

    total_pause_seconds = sum(pauses)
    long_pause_count = sum(1 for pause in pauses if pause >= 1.2)
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
    target_duration_seconds = get_speaking_target_duration_seconds(part_number)
    coverage_ratio = (
        effective_duration_seconds / target_duration_seconds
        if effective_duration_seconds and target_duration_seconds and target_duration_seconds > 0
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
        "pause_ratio": pause_ratio,
        "long_pause_count": long_pause_count,
        "avg_no_speech_prob": avg_no_speech_prob,
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
    duration_seconds: float | None,
    segments: list[Segment],
) -> tuple[list[RubricScore], str]:
    features = build_speaking_feature_map(
        transcript,
        segments,
        part_number=part_number,
        duration_seconds=duration_seconds,
    )
    word_count = int(features["word_count"] or 0)
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
    audio_backed = bool(segments)

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
        if coverage_ratio < 0.45:
            fluency_score -= 1.0
        elif coverage_ratio < 0.7:
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

    if pause_ratio > 0.28:
        pronunciation_score -= 0.5
    if avg_no_speech_prob > 0.55:
        pronunciation_score -= 0.25
    if words_per_minute is not None and (words_per_minute < 75 or words_per_minute > 190):
        pronunciation_score -= 0.25

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
    return rubrics, overall_feedback


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
    duration_seconds: float | None = Form(None),
):
    transcript = (transcript_text or "").strip()
    segments: list[Segment] = []

    if audio is not None:
        if whisper_model is None:
            raise HTTPException(status_code=503, detail="Whisper model not loaded.")

        suffix = os.path.splitext(audio.filename or ".wav")[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            segments, detected_transcript = await asyncio.to_thread(
                transcribe_audio_file,
                tmp_path,
                language="en",
                word_timestamps=True,
            )
            transcript = detected_transcript or transcript
        except Exception as ex:
            logger.exception("Failed to transcribe speaking audio for answer %s.", answer_id)
            if not transcript:
                raise HTTPException(status_code=400, detail=f"Could not transcribe audio: {ex}") from ex
        finally:
            os.unlink(tmp_path)
    elif not transcript:
        raise HTTPException(status_code=400, detail="Audio file or transcript_text is required.")

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Could not transcribe audio.")

    rubrics, overall_feedback = await score_speaking_rubrics(
        transcript,
        answer_id=answer_id,
        question_prompt=question_prompt,
        part_number=part_number,
        duration_seconds=duration_seconds,
        segments=segments,
    )
    overall_band = round_band_half(sum(rubric.band for rubric in rubrics) / len(rubrics))
    return ScoreResponse(
        session_id=session_id,
        answer_id=answer_id,
        overall_band=overall_band,
        rubrics=rubrics,
        overall_feedback=overall_feedback,
        transcript_text=transcript,
    )


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
    return {"status": "ok", "whisper_loaded": whisper_model is not None}
