@echo off
setlocal
cd /d "%~dp0"
if not exist "venv\Scripts\python.exe" (
  echo [!] Chua tim thay venv tai %~dp0venv
  pause
  exit /b 1
)

echo [*] Dang khoi dong AI Scoring Service tai http://localhost:8000...
title English4U AI Scoring Service
venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
pause
