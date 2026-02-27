from pydantic import BaseModel, Field
from typing import List, Optional

class Question(BaseModel):
    content: str
    options: str = Field(description="Các lựa chọn phân cách bởi ký tự |")
    correctAnswer: str
    explanation: str
    points: int = 1

class ExamGenerationRequest(BaseModel):
    document_content: str
    num_questions: int = 10
    difficulty: str = "medium"

class ExamGenerationResponse(BaseModel):
    title: str
    questions: List[Question]
