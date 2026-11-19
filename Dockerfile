# Clip Maker — local-first auto clip studio
# Multi-stage build: stage 1 installs Node deps and builds the web UI (dist/),
# stage 2 is the runtime (Node 22 + FFmpeg + Python venv with
# faster-whisper / OpenCV / yt-dlp, mirroring what start.sh sets up locally).

# ---------- Stage 1: build ----------
FROM node:22-bookworm AS build
WORKDIR /app

# Install ALL dependencies (dev deps included: the server runs via tsx
# and the UI build needs vite + typescript).
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# ---------- Stage 2: runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# System runtime needs: FFmpeg (rendering), Python 3 (AI/CV worker),
# fonts for burned-in captions.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       ffmpeg \
       python3 \
       python3-venv \
       python3-pip \
       fonts-noto-core \
       ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Python venv exactly where the server looks for it (.venv/bin/python),
# with the same packages start.sh installs.
RUN python3 -m venv .venv \
  && .venv/bin/pip install --no-cache-dir --upgrade pip \
  && .venv/bin/pip install --no-cache-dir yt-dlp faster-whisper opencv-python-headless

# Make the venv's yt-dlp / python discoverable on PATH as a fallback.
ENV PATH="/app/.venv/bin:$PATH"

# App code + built UI + installed Node modules from the build stage.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/config ./config
COPY --from=build /app/index.html ./index.html

# Runtime data (projects, cache, outputs) — docker-compose mounts a volume here.
RUN mkdir -p storage

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Same entry point start.sh uses (tsx server.ts); NODE_ENV=production makes
# it serve the pre-built dist/ UI instead of the Vite dev middleware.
CMD ["npx", "tsx", "server.ts"]
