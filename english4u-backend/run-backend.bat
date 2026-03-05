@echo off
echo [*] Dang tat tap tin backend cu dang vao memory...
powershell -Command "Stop-Process -Name EnglishExamApp.API -Force -ErrorAction SilentlyContinue"
echo [*] Publishing Backend outside OneDrive to bypass Windows Defender Application Control...
dotnet publish EnglishExamApp.API -o "C:\EnglishExamApp\publish" --no-self-contained


echo [*] Starting Backend...
cd /d "C:\EnglishExamApp\publish"
title EnglishExamApp Backend
EnglishExamApp.API.exe
pause
