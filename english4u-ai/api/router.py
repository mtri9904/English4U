from fastapi import APIRouter
from api.endpoints import exams

api_router = APIRouter()
api_router.include_router(exams.router, prefix="/exams", tags=["exams"])
