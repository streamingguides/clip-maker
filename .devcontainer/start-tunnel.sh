#!/usr/bin/env bash
# Starts a Cloudflare quick tunnel to the local Clip Maker server and
# publishes the public URL as LIVE-URL.txt in the repo (committed + pushed),
# so the live URL can be picked up from outside without SSH access.
set -u
cd /workspaces/clip-maker || exit 0
export PATH="$HOME/.local/bin:$PATH"
LOG=/tmp/clipmaker-tunnel.log

# Wait for the app server to answer (up to ~5 minutes).
for i in $(seq 1 60); do
  if curl -s -o /dev/null http://localhost:3000/; then break; fi
  sleep 5
done

# cloudflared binary if missing.
if ! command -v cloudflared >/dev/null 2>&1; then
  mkdir -p "$HOME/.local/bin"
  curl -sL -o "$HOME/.local/bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 >> "$LOG" 2>&1
  chmod +x "$HOME/.local/bin/cloudflared" >> "$LOG" 2>&1
fi

pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1
nohup cloudflared tunnel --url http://localhost:3000 --no-autoupdate > "$LOG" 2>&1 &

URL=""
for i in $(seq 1 30); do
  URL=$(grep -o "https://[a-z0-9-]*\.trycloudflare\.com" "$LOG" 2>/dev/null | grep -v "api\.trycloudflare\.com" | head -1)
  [ -n "$URL" ] && break
  sleep 3
done
echo "tunnel url: ${URL:-none}" >> "$LOG"
[ -z "$URL" ] && exit 0

echo "$URL" > LIVE-URL.txt
git add -f LIVE-URL.txt >> "$LOG" 2>&1
git -c user.name="Clip Maker (Codespaces)" -c user.email="codespaces@localhost" commit -m "live tunnel url (auto)" >> "$LOG" 2>&1
git push origin main >> "$LOG" 2>&1
echo "published $URL" >> "$LOG"
