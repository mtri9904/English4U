from fastapi import APIRouter, HTTPException
from models.exam_models import ExamGenerationRequest, ExamGenerationResponse
from services.exam_service import ExamService

router = APIRouter()
exam_service = ExamService()

@router.post("/generate", response_model=ExamGenerationResponse)
async def generate_exam(request: ExamGenerationRequest):
    try:
        response = await exam_service.generate_exam(request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
