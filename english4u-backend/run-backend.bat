@echo off
setlocal
echo [*] Su dung Gemma API key tu cau hinh backend (appsettings/env cua backend).

echo [*] Dang tat tap tin backend cu dang vao memory...
powershell -Command "Stop-Process -Name EnglishExamApp.API -Force -ErrorAction SilentlyContinue"
echo [*] Publishing Backend outside OneDrive to bypass Windows Defender Application Control...
dotnet publish EnglishExamApp.API -o "C:\EnglishExamApp\publish" --no-self-contained
if errorlevel 1 (
  echo [x] Publish that bai. Da dung script de tranh chay ban backend cu.
  exit /b 1
)


echo [*] Starting Backend...
cd /d "C:\EnglishExamApp\publish"
title EnglishExamApp Backend
EnglishExamApp.API.exe
pause
