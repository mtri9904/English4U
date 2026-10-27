@echo off
setlocal
set "PATH=%LOCALAPPDATA%\Microsoft\dotnet;%PATH%"
set "ASPNETCORE_ENVIRONMENT=Development"
set "DOTNET_ENVIRONMENT=Development"
set "ASPNETCORE_URLS=http://localhost:5000"
set "DOTNET_ROLL_FORWARD=Major"

echo [*] Dang tat tien trinh backend cu tren port 5000 (neu co)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /f /pid %%a 2>nul
timeout /t 1 /nobreak >nul

echo [*] Dang unblock cac file assembly neu bi Windows App Control / OneDrive chan...
powershell -NoProfile -Command "Get-ChildItem -Path '%~dp0' -Recurse -Filter *.dll -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" 2>nul

cd /d "%~dp0EnglishExamApp.API"
echo [*] Dang build Backend...
dotnet build EnglishExamApp.API.csproj -c Debug
if errorlevel 1 (
  echo [!] Build that bai!
  pause
  exit /b 1
)

echo [*] Dang chay Backend English4U (SQLite) tai http://localhost:5000...
title EnglishExamApp Backend
dotnet run --no-build -c Debug --urls "http://localhost:5000"
pause
