from pydantic import BaseModel
from typing import Optional

class SpeakingFeedbackRequest(BaseModel):
    audio_base64: str
    topic: Optional[str] = None

class SpeakingFeedbackResponse(BaseModel):
    band_score: float
    pronunciation: float
    fluency: float
    grammar: float
    vocabulary: float
    detailed_feedback: str
