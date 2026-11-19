@echo off
setlocal enabledelayedexpansion
title Clip Maker - 100%% Free Short Clip Studio

echo ==================================================
echo   Clip Maker - Starting Local Setup
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js not found. Attempting install via winget...
  winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo Please install Node.js 22 LTS from https://nodejs.org and double-click start.bat again.
    pause
    exit /b 1
  )
)

where ffmpeg >nul 2>&1
if errorlevel 1 (
  echo FFmpeg not found. Attempting install via winget...
  winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements
)

if not exist node_modules (
  echo Installing web app packages...
  call npm install
)

where python >nul 2>&1
if not errorlevel 1 (
  if not exist .venv (
    echo Creating local Python environment for free yt-dlp and faster-whisper...
    python -m venv .venv
  )
  call .venv\Scripts\activate.bat
  python -m pip install --quiet --upgrade pip yt-dlp
  python -c "import faster_whisper" >nul 2>&1
  if errorlevel 1 (
    echo Installing faster-whisper and OpenCV (one-time free download, ~150 MB)...
    python -m pip install --quiet faster-whisper opencv-python-headless
  )
) else (
  echo Note: Python not found. Video upload + ffmpeg clipping works, and you can install Python 3.11+ for offline faster-whisper + yt-dlp.
)

echo.
echo Starting Clip Maker at http://localhost:3000 ...
start "" http://localhost:3000
call npm run dev
pause
