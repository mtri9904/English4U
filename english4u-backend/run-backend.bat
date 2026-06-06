@echo off
setlocal
set "ASPNETCORE_ENVIRONMENT=Development"
set "DOTNET_ENVIRONMENT=Development"
set "ASPNETCORE_URLS=http://localhost:5000"
echo [*] Su dung Gemma API key tu cau hinh backend (appsettings/env cua backend).

set "DOTNET_EF=%USERPROFILE%\.dotnet\tools\dotnet-ef.exe"
if not exist "%DOTNET_EF%" (
  set "DOTNET_EF=dotnet ef"
)

echo [*] Dang tat tap tin backend cu dang vao memory...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do taskkill /f /pid %%a
timeout /t 2 /nobreak >nul

echo [*] Dang cap nhat database schema...
call %DOTNET_EF% database update --project EnglishExamApp.Infrastructure\EnglishExamApp.Infrastructure.csproj --startup-project EnglishExamApp.API\EnglishExamApp.API.csproj
if errorlevel 1 (
  echo [!] Migration that bai ^(co the do Application Control policy^). Tiep tuc...
)

echo [*] Starting Backend directly using dotnet run to bypass Windows Defender Application Control...
title EnglishExamApp Backend
dotnet run --project EnglishExamApp.API\EnglishExamApp.API.csproj --urls "http://localhost:5000"
pause
