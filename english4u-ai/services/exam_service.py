import json
import google.generativeai as genai
from core.config import settings
from models.exam_models import ExamGenerationRequest, ExamGenerationResponse

genai.configure(api_key=settings.GEMINI_API_KEY)

class ExamService:
    def __init__(self):
        # Using gemini-1.5-flash as it is fast and recommended for general text tasks
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    async def generate_exam(self, request: ExamGenerationRequest) -> ExamGenerationResponse:
        prompt = f"""
        You are an expert English teacher. 
        Generate an English multiple-choice exam based strictly on the following text.
        Number of questions: {request.num_questions}
        Difficulty level: {request.difficulty}
        
        Text context:
        \"\"\"{request.document_content}\"\"\"
        
        Output MUST be in valid JSON format matching this schema exactly without any markdown format:
        {{
            "questions": [
                {{
                    "question_text": "string",
                    "options": [
                        {{ "id": "A", "content": "string" }},
                        {{ "id": "B", "content": "string" }},
                        {{ "id": "C", "content": "string" }},
                        {{ "id": "D", "content": "string" }}
                    ],
                    "correct_option_id": "A|B|C|D",
                    "explanation": "string (Why this is the correct answer)"
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
