import json
import fitz  # PyMuPDF
import docx
from io import BytesIO
from fastapi import UploadFile
import google.generativeai as genai
from core.config import settings
from models.exam_models import ExamGenerationResponse

genai.configure(api_key=settings.GEMINI_API_KEY)

class ExamService:
    def __init__(self):
        # Using gemini-1.5-flash as it is fast and recommended for general text tasks
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    async def extract_text(self, file: UploadFile) -> str:
        content = await file.read()
        filename = file.filename.lower()
        text = ""

        if filename.endswith(".pdf"):
            pdf_document = fitz.open(stream=content, filetype="pdf")
            for page in pdf_document:
                text += page.get_text() + "\n"
        elif filename.endswith(".docx"):
            doc = docx.Document(BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        elif filename.endswith(".txt"):
            text = content.decode("utf-8")
        else:
            raise ValueError(f"Unsupported file format: {filename}")
        
        return text.strip()

    async def generate_exam_from_file(self, file: UploadFile, num_questions: int, difficulty: str) -> ExamGenerationResponse:
        document_content = await self.extract_text(file)
        
        if not document_content:
            raise ValueError("File is empty or text could not be extracted")

        prompt = f"""
        You are an expert English teacher. 
        Generate an English multiple-choice exam based strictly on the following text.
        Number of questions: {num_questions}
        Difficulty level: {difficulty}
        
        Text context:
        \"\"\"{document_content}\"\"\"
        
        CRITICAL RULES:
        1. If the original document DOES NOT contain answers, YOU MUST solve the questions yourself to determine the `correctAnswer` and provide a detailed `explanation`.
        2. The `options` MUST be exactly 4 choices separated by the pipe character '|' (e.g., "Apple|Banana|Orange|Mango"). Do NOT include A, B, C, D prefixes in the options string itself unless part of the answer.
        3. The `correctAnswer` must exactly match the text of one of those options.
        4. Include a suitable `title` for the exam based on the text.
        
        Output MUST be in valid JSON format matching this schema exactly without any markdown formatting:
        {{
            "title": "string (Exam Title)",
            "questions": [
                {{
                    "content": "string (The question text)",
                    "options": "string (Option 1|Option 2|Option 3|Option 4)",
                    "correctAnswer": "string (Exact match of the correct option)",
                    "explanation": "string (Why this answer is correct. Essential even if not in original text)",
                    "points": 1
                }}
            ]
        }}
        """
        
        # We enforce JSON output using response_mime_type config
        response = self.model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
            )
        )
        
        try:
            # Parse the text as JSON and map to Pydantic Model
            data = json.loads(response.text)
            return ExamGenerationResponse(**data)
        except Exception as e:
            raise Exception(f"Failed to parse Gemini response or validation error. Raw response: {response.text}, Error: {str(e)}")
