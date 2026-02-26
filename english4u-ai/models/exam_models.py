from pydantic import BaseModel
from typing import List, Optional

class Option(BaseModel):
    id: str
    content: str

class Question(BaseModel):
    question_text: str
    options: List[Option]
    correct_option_id: str
    explanation: Optional[str] = None

class ExamGenerationRequest(BaseModel):
    document_content: str
    num_questions: int = 10
    difficulty: str = "medium"

class ExamGenerationResponse(BaseModel):
    questions: List[Question]
