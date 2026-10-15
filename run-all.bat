@echo off
echo ========================================================
echo       English4U - Khoi dong toan bo he thong Local
echo ========================================================
echo.
echo [*] 1. Khoi dong Backend (ASP.NET Core + SQLite)...
start "English4U Backend" cmd /k "call english4u-backend\run-backend.bat"

echo [*] 2. Khoi dong AI Scoring Service (Python FastAPI)...
start "English4U AI Service" cmd /k "call AiScoringService\run-ai.bat"

echo [*] 3. Khoi dong Frontend (React + Vite)...
start "English4U Frontend" cmd /k "call english4u-frontend\run-frontend.bat"

echo.
echo [V] Da mo 3 cua so dich vu!
echo     - Frontend: http://localhost:5173
echo     - Backend:  http://localhost:5000 (Swagger/Scalar API)
echo     - AI:       http://localhost:8000/docs
echo ========================================================
pause
