import asyncio
import json
import logging
import os
import re
import tempfile
from contextlib import asynccontextmanager
from typing import Literal

import instructor
import ollama
from docling.document_converter import DocumentConverter
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from faster_whisper import WhisperModel
from openai import OpenAI
from pdf_parser import parse_ielts_pdf, parsed_passage_to_group
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

load_dotenv()

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen3:8b")

whisper_model: WhisperModel | None = None

instructor_client = instructor.from_openai(
    OpenAI(base_url="http://localhost:11434/v1", api_key="ollama"),
    mode=instructor.Mode.JSON,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_model
    model_size = os.getenv("WHISPER_MODEL_SIZE", "base")
    whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")
    yield
    whisper_model = None


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
    return instructor_client.chat.completions.create(
        model=OLLAMA_MODEL,
        response_model=ReadingExam,
        messages=[
            {"role": "system", "content": READING_SYSTEM_PROMPT},
            {"role": "user", "content": cleaned_text},
        ],
        max_retries=3,
    )


@app.post("/api/ai/generate-reading-exam")
async def generate_reading_exam(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=f"Only PDF files are accepted. Received: {file.filename}",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        logger.info("Converting PDF to Markdown with Docling: %s", file.filename)
        markdown_text = await asyncio.to_thread(convert_pdf_to_markdown, tmp_path)

        if not markdown_text.strip():
            raise HTTPException(status_code=400, detail="PDF contains no extractable text.")

        logger.info("Markdown extracted: %d chars. Cleaning garbage...", len(markdown_text))
        cleaned = clean_garbage_text(markdown_text)
        logger.info(
            "After cleaning: %d chars (removed %d chars of garbage)",
            len(cleaned),
            len(markdown_text) - len(cleaned),
        )

        logger.info("Calling Instructor + Ollama (model=%s) ...", OLLAMA_MODEL)
        exam_data = await asyncio.to_thread(generate_reading_exam_from_markdown, markdown_text)

        return exam_data.model_dump()

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to generate reading exam: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI processing failed: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)




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


async def call_ollama(prompt: str) -> dict:
    response = await asyncio.to_thread(
        ollama.chat,
        model=OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        format="json",
    )
    text = response["message"]["content"].strip()
    return json.loads(text)


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
    result = await call_ollama(prompt)
    return ScoreResponse(
        session_id=request.session_id,
        answer_id=request.answer_id,
        overall_band=result.get("overall_band", 0),
        rubrics=[RubricScore(**r) for r in result.get("rubrics", [])],
    )


@app.post("/api/ai/score-speaking", response_model=ScoreResponse)
async def score_speaking(
    audio: UploadFile = File(...),
    session_id: str = Form(...),
    answer_id: str = Form(...),
    question_prompt: str | None = Form(None),
):
    if whisper_model is None:
        raise HTTPException(status_code=503, detail="Whisper model not loaded.")

    suffix = os.path.splitext(audio.filename or ".wav")[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        segments, _ = whisper_model.transcribe(tmp_path, language="en")
        transcript = " ".join(segment.text.strip() for segment in segments)
    finally:
        os.unlink(tmp_path)

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Could not transcribe audio.")

    prompt = build_scoring_prompt(
        text=transcript,
        rubrics=SPEAKING_RUBRICS,
        skill_type="Speaking",
        question_prompt=question_prompt,
    )
    result = await call_ollama(prompt)
    return ScoreResponse(
        session_id=session_id,
        answer_id=answer_id,
        overall_band=result.get("overall_band", 0),
        rubrics=[RubricScore(**r) for r in result.get("rubrics", [])],
    )


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


FILL_ANSWERS_PROMPT = """You are an expert IELTS examiner. Given a reading passage and its questions, provide the correct answer and a brief explanation for EACH question.

PASSAGE:
\"\"\"
{passage_text}
\"\"\"

QUESTIONS (JSON):
{questions_json}

For each question, determine the correct answer based ONLY on information in the passage.
Rules:
- For TFNG/YNNG: answer must be exactly "TRUE", "FALSE", "NOT GIVEN", "YES", or "NO".
- For MCQ_SINGLE/MCQ_MULTIPLE and MATCHING*: answer must be the exact letter label (e.g. A, B, i, ii).
- For COMPLETION and SHORT_ANSWER: answer must be the exact word(s) from the passage.
- Explanation must be 1-2 sentences citing the passage.

Return ONLY valid JSON array:
[
  {{
    "number": <question number>,
    "correctAnswer": "<answer>",
    "explanation": "<brief explanation citing the passage>"
  }}
]"""


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

    result = instructor_client.chat.completions.create(
        model=OLLAMA_MODEL,
        response_model=ReadingQuestionGroup,
        messages=[
            {"role": "system", "content": STREAMING_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        max_retries=3,
    )

    group_dict = result.model_dump()
    questions = group_dict.get("questions", [])
    for i, q in enumerate(questions):
        q["orderIndex"] = i
        q["points"] = q.get("points", 1.0)
        if q.get("options") is None:
            q["options"] = []
        for j, opt in enumerate(q.get("options", [])):
            opt["orderIndex"] = j

    return {
        "title": group_dict.get("title", f"Passage {passage_number}"),
        "content": group_dict.get("content", ""),
        "audioUrl": None,
        "orderIndex": passage_number - 1,
        "questions": questions,
    }


@app.post("/api/ai/generate-exam-from-pdf")
async def generate_exam_from_pdf(file: UploadFile = File(...)):
    logger.info("Received file: %s", file.filename)
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail=f"Only PDF files are accepted. Received: {file.filename}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        raw_text = extract_pdf_text(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to extract PDF text: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    if not raw_text.strip():
        raise HTTPException(status_code=400, detail="PDF contains no extractable text.")

    parsed = parse_ielts_pdf(raw_text)
    num_passages = len(parsed.passages)

    test_content_raw, answer_key_raw = split_test_and_answers(raw_text)
    test_content = clean_garbage_text(test_content_raw)
    answer_key = answer_key_raw.strip()

    logger.info(
        "PDF split: test=%d chars, answer_key=%d chars, pdfplumber passages=%d, questions=%d",
        len(test_content), len(answer_key), num_passages, parsed.total_questions,
    )

    async def stream_generator():
        try:
            if num_passages > 0 and parsed.has_enough_questions and parsed.has_all_answers:
                mode = "SCAN"
            elif num_passages > 0 and parsed.has_enough_questions:
                mode = "FILL_ANSWERS"
            else:
                mode = "FULL_AI"

            logger.info("MODE: %s", mode)

            if mode in ("SCAN", "FILL_ANSWERS"):
                title = parsed.passages[0].title if parsed.passages else "IELTS Reading Practice"
                total_q = parsed.total_questions
            else:
                title = file.filename.replace(".pdf", "").replace("_", " ").replace("-", " ").title() if file.filename else "IELTS Reading Practice"
                total_q = 0

            metadata = {
                "title": f"{title} - Practice Test",
                "description": f"Extracted from PDF ({mode})",
                "durationMinutes": 60,
                "examType": "IELTS",
            }

            if mode == "SCAN":
                metadata["description"] = f"{num_passages} passages, {total_q} questions (all answers found)"
            elif mode == "FILL_ANSWERS":
                metadata["description"] = f"{num_passages} passages, {total_q} questions ({parsed.total_missing_answers} answers by AI)"

            yield json.dumps({"type": "metadata", "data": metadata}) + "\n"

            actual_passages = num_passages if mode != "FULL_AI" else 3
            generated_count = 0

            for idx in range(actual_passages):
                if mode == "SCAN":
                    passage = parsed.passages[idx]
                    group = parsed_passage_to_group(passage, idx)
                    generated_count += passage.question_count
                    logger.info(
                        "SCAN Passage %d/%d '%s': %d questions",
                        idx + 1, actual_passages, passage.title, passage.question_count,
                    )

                elif mode == "FILL_ANSWERS":
                    passage = parsed.passages[idx]
                    if passage.has_all_answers:
                        group = parsed_passage_to_group(passage, idx)
                        logger.info("FILL Passage %d/%d '%s': all answered", idx + 1, actual_passages, passage.title)
                    else:
                        missing_qs = []
                        for g in passage.question_groups:
                            for q in g.questions:
                                if not q.correct_answer:
                                    missing_qs.append({
                                        "number": q.number,
                                        "questionType": q.question_type,
                                        "content": q.content,
                                        "options": [{"label": o.label, "text": o.text} for o in q.options],
                                    })

                        logger.info(
                            "FILL Passage %d/%d '%s': %d missing -> AI solving",
                            idx + 1, actual_passages, passage.title, len(missing_qs),
                        )

                        fill_prompt = FILL_ANSWERS_PROMPT.format(
                            passage_text=passage.content[:6000],
                            questions_json=json.dumps(missing_qs, ensure_ascii=False, indent=2),
                        )
                        ai_answers = await call_ollama(fill_prompt)
                        answers_list = ai_answers if isinstance(ai_answers, list) else ai_answers.get("answers", ai_answers.get("questions", []))

                        for item in answers_list:
                            q_num = item.get("number")
                            if q_num is None:
                                continue
                            for g in passage.question_groups:
                                for q in g.questions:
                                    if q.number == q_num and not q.correct_answer:
                                        q.correct_answer = item.get("correctAnswer", "")
                                        q.explanation = item.get("explanation", "")

                        group = parsed_passage_to_group(passage, idx)

                    generated_count += passage.question_count

                else:
                    logger.info(
                        "FULL_AI Passage %d/%d: Calling Instructor + %s with Pydantic schema...",
                        idx + 1, actual_passages, OLLAMA_MODEL,
                    )
                    group = await asyncio.to_thread(
                        generate_single_passage,
                        test_content[:12000],
                        answer_key[:6000],
                        idx + 1,
                        actual_passages,
                    )
                    generated_count += len(group.get("questions", []))
                    logger.info(
                        "FULL_AI Passage %d/%d '%s': %d questions generated",
                        idx + 1, actual_passages, group.get("title", "?"), len(group.get("questions", [])),
                    )

                yield json.dumps({"type": "passage", "index": idx, "total": actual_passages, "data": group}) + "\n"

            yield json.dumps({"type": "done"}) + "\n"
            logger.info("Stream completed: %d passages, %d total questions", actual_passages, generated_count)

        except Exception as e:
            logger.error("Stream generation failed: %s", e, exc_info=True)
            yield json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(stream_generator(), media_type="application/x-ndjson")


@app.get("/health")
async def health():
    return {"status": "ok", "whisper_loaded": whisper_model is not None}
