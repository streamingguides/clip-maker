#!/usr/bin/env bash
# Starts a Cloudflare quick tunnel to the local Clip Maker server and
# publishes the public URL as LIVE-URL.txt in the repo (committed + pushed),
# so the live URL can be picked up from outside without SSH access.
# On every exit path it also publishes LIVE-DEBUG.txt with step markers and
# log tails, so failures can be diagnosed from outside.
set -u
cd /workspaces/clip-maker || exit 0
export PATH="$HOME/.local/bin:$PATH"
LOG=/tmp/clipmaker-tunnel.log
echo "=== tunnel script started $(date -u) ===" >> "$LOG"

publish() {
  {
    echo "published at $(date -u)"
    echo "--- tunnel log ---"
    tail -40 /tmp/clipmaker-tunnel.log 2>/dev/null
    echo "--- setup log tail ---"
    tail -20 /tmp/clipmaker-setup.log 2>/dev/null
    echo "--- server log tail ---"
    tail -10 /tmp/clipmaker.log 2>/dev/null
  } > LIVE-DEBUG.txt 2>/dev/null
  git add -f LIVE-URL.txt LIVE-DEBUG.txt >> "$LOG" 2>&1
  git -c user.name="Clip Maker (Codespaces)" -c user.email="codespaces@localhost" commit -m "live tunnel url (auto)" >> "$LOG" 2>&1
  git push origin main >> "$LOG" 2>&1
  echo "git publish rc=$?" >> "$LOG"
  # Fallback: Contents API with the codespace token, if present.
  if [ -n "${GITHUB_TOKEN:-}" ] && [ -f LIVE-URL.txt ]; then
    B64=$(base64 -w0 LIVE-URL.txt 2>/dev/null)
    SHA=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/repos/streamingguides/clip-maker/contents/LIVE-URL.txt | grep -o '"sha": *"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$SHA" ]; then PAYLOAD="{\"message\":\"live tunnel url (auto)\",\"content\":\"$B64\",\"sha\":\"$SHA\"}"; else PAYLOAD="{\"message\":\"live tunnel url (auto)\",\"content\":\"$B64\"}"; fi
    curl -s -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/repos/streamingguides/clip-maker/contents/LIVE-URL.txt -d "$PAYLOAD" >> "$LOG" 2>&1
    echo "api publish done" >> "$LOG"
  fi
}

# Wait for the app server to answer (up to ~5 minutes).
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000/; then echo "server answering after ${i} checks" >> "$LOG"; break; fi
  sleep 5
done

# cloudflared binary if missing.
if ! command -v cloudflared >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  curl -sL -o "$HOME/.local/bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 >> "$LOG" 2>&1
  chmod +x "$HOME/.local/bin/cloudflared" >> "$LOG" 2>&1
fi
cloudflared --version >> "$LOG" 2>&1 || echo "cloudflared not runnable" >> "$LOG"

URL=""
for attempt in 1 2; do
  pkill -f "cloudflared tunnel" 2>/dev/null
  sleep 1
  : > /tmp/clipmaker-tunnel-run.log
  nohup cloudflared tunnel --url http://localhost:3000 --no-autoupdate > /tmp/clipmaker-tunnel-run.log 2>&1 &
  echo "cloudflared attempt $attempt pid $!" >> "$LOG"
  for i in $(seq 1 40); do
    URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" /tmp/clipmaker-tunnel-run.log 2>/dev/null | grep -v "api\.trycloudflare\.com" | head -1)
    [ -n "$URL" ] && break
    sleep 3
  done
  cat /tmp/clipmaker-tunnel-run.log >> "$LOG" 2>/dev/null
  [ -n "$URL" ] && break
  echo "attempt $attempt produced no URL" >> "$LOG"
done

echo "tunnel url: ${URL:-none}" >> "$LOG"
if [ -n "$URL" ]; then echo "$URL" > LIVE-URL.txt; fi
publish
echo "=== tunnel script finished $(date -u) ===" >> "$LOG"
