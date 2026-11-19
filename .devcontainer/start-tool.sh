#!/usr/bin/env bash
# Codespaces auto-setup for Clip Maker.
# Runs on every codespace start (postStartCommand). Everything heavy is
# detached/backgrounded so the codespace becomes ready quickly; progress
# is logged to /tmp/clipmaker-setup.log and the server to /tmp/clipmaker.log
set -u
cd /workspaces/clip-maker || exit 0
export PATH="$HOME/.local/bin:$PATH"
LOG=/tmp/clipmaker-setup.log

# Do the whole setup once per container, in the background.
if [ -f /tmp/clipmaker-setup-started ]; then
  exit 0
fi
touch /tmp/clipmaker-setup-started

(
  echo "=== setup started $(date -u) ===" >> "$LOG"

  # ffmpeg (needed by the render pipeline) — universal image usually has it.
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "installing ffmpeg..." >> "$LOG"
    sudo apt-get update >> "$LOG" 2>&1
    sudo apt-get install -y ffmpeg >> "$LOG" 2>&1
  fi
  ffmpeg -version 2>/dev/null | head -1 >> "$LOG"

  # Node dependencies
  if [ ! -d node_modules ]; then
    echo "npm install..." >> "$LOG"
    npm install >> "$LOG" 2>&1
  fi

  # yt-dlp standalone binary if not present
  if ! command -v yt-dlp >/dev/null 2>&1; then
    echo "downloading yt-dlp binary..." >> "$LOG"
    mkdir -p "$HOME/.local/bin"
    curl -sL -o "$HOME/.local/bin/yt-dlp" https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp >> "$LOG" 2>&1
    chmod +x "$HOME/.local/bin/yt-dlp" >> "$LOG" 2>&1
  fi

  # Python worker venv (faster-whisper + OpenCV) — best effort, in parallel
  # with the server start below; transcription degrades gracefully without it.
  (
    if [ ! -x .venv/bin/python ]; then
      echo "creating .venv + pip installs..." >> "$LOG"
      python3 -m venv .venv >> "$LOG" 2>&1
      .venv/bin/pip install -U pip >> "$LOG" 2>&1
      .venv/bin/pip install faster-whisper opencv-python-headless yt-dlp >> "$LOG" 2>&1
      echo "venv done" >> "$LOG"
    fi
  ) &

  # Start the app server (detached) if not already answering.
  if ! curl -s -o /dev/null http://localhost:3000/; then
    echo "starting server..." >> "$LOG"
    export PATH="$HOME/.local/bin:$PATH"
    nohup npx tsx server.ts > /tmp/clipmaker.log 2>&1 &
    echo "server launched pid $!" >> "$LOG"
  fi
  echo "=== setup script finished $(date -u) ===" >> "$LOG"
) > /dev/null 2>&1 &

exit 0
