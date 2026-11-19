#!/usr/bin/env bash
set -e

echo "=================================================="
echo "  Clip Maker - Starting Local Setup"
echo "=================================================="

OS="$(uname -s)"

# 1. Ensure Node.js & FFmpeg
if ! command -v node >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1; then
  if [ "$OS" = "Darwin" ] && command -v brew >/dev/null 2>&1; then
    echo "Installing Node.js and FFmpeg via Homebrew..."
    brew install node ffmpeg || true
  elif command -v apt-get >/dev/null 2>&1; then
    echo "Installing Node.js and FFmpeg via apt..."
    sudo apt-get update && sudo apt-get install -y nodejs npm ffmpeg python3 python3-venv python3-pip || true
  else
    echo "Please install Node.js 22+ and FFmpeg, then run ./start.sh again."
    exit 1
  fi
fi

# 2. Install npm packages
if [ ! -d "node_modules" ]; then
  echo "Installing Node dependencies..."
  npm install
fi

# 3. Setup local Python venv for free yt-dlp + faster-whisper + OpenCV
if command -v python3 >/dev/null 2>&1; then
  if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment (.venv)..."
    python3 -m venv .venv || true
  fi
  if [ -f ".venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python -m pip install --quiet --upgrade pip yt-dlp || true
    if ! python -c "import faster_whisper" >/dev/null 2>&1; then
      echo "Installing faster-whisper and OpenCV (one-time free setup)..."
      python -m pip install --quiet faster-whisper opencv-python-headless || true
    fi
  fi
fi

# 4. Open browser and run server
echo "Opening http://localhost:3000 ..."
if [ "$OS" = "Darwin" ]; then
  (sleep 2 && open "http://localhost:3000") &
elif command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open "http://localhost:3000") &
fi

npm run dev
