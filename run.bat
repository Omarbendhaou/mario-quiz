@echo off
title Super Mario Quiz - Chapter 8: Closing Projects
echo ======================================================================
echo    🍄 SUPER MARIO CLASSROOM QUIZ - CHAPTER 8: CLOSING PROJECTS 🍄
echo ======================================================================
echo.

echo Checking Node.js environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js (v16+) from https://nodejs.org/ to launch the server.
    echo.
    pause
    exit /b 1
)

echo Node.js detected:
node -v
echo.

if not exist node_modules (
    echo [Setup] Installing required dependencies (Express, Socket.IO, qrcode)...
    call npm install
    echo.
)

echo Starting Quiz Server on http://localhost:3000 ...
echo - Projector Host Screen: http://localhost:3000/host (Host PIN: 1234)
echo - Student / Player Screen: http://localhost:3000
echo.
echo Opening Projector Host screen in default browser...
start "" "http://localhost:3000/host"

node server.js
pause
