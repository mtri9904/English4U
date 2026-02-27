from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from models.exam_models import ExamGenerationResponse
from services.exam_service import ExamService

router = APIRouter()
exam_service = ExamService()

@router.post("/generate", response_model=ExamGenerationResponse)
async def generate_exam(
    file: UploadFile = File(...),
    num_questions: int = Form(10),
    difficulty: str = Form("medium")
):
    try:
        response = await exam_service.generate_exam_from_file(file, num_questions, difficulty)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
