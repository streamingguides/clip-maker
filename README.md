# Clip Maker — 100% Free Short Video & Caption Studio

Turn any long video (YouTube, Facebook, Twitch, or a file on your computer) into ready-to-post short clips (Reels, Shorts, TikTok) with word-synced captions, hook headlines, clean voice, and 4 aspect ratios — **completely free on your own computer**.

- **Zero cost:** No subscriptions, no watermarks, no monthly limits, no per-clip fees, no paid APIs.
- **Private & Local:** Your videos stay on your own PC. Nothing is uploaded to external servers.

## Campaign Mode (Vyro & Content Rewards)

Clipping for a paid streamer campaign? Pick a campaign from the **Campaign Mode** dropdown on the Start screen and Clip Maker applies that campaign's rules for you. Ready-made presets live in `config/campaigns.json` — a Vyro template plus Dylan Page, KreekCraft, and Kai Cenat (Content Rewards) — and you can add your own by copying a preset and editing its name, hashtags, and mention. In Campaign Mode the required **#ad disclosure is burned onto every clip**, clips are pinned to 9:16 and the campaign's length limits, the same moment is never clipped twice for one campaign, and the download ZIP includes a `post_captions.txt` with a ready-to-post caption for every clip plus the campaign's submit checklist (join first, post, submit your link on time).

---

## 1. One-Click Start (Takes Under 15 Minutes)

### On Windows (Recommended)
1. Download or unzip this project folder anywhere on your computer (for example `C:\ClipMaker`).
2. Double-click **`start.bat`**.
3. The first time you run it, it will automatically install free tools if missing:
   - **Node.js 22 LTS** & web packages
   - **FFmpeg** (video & audio engine)
   - **yt-dlp** (video link downloader)
   - **faster-whisper** + **OpenCV** (offline speech captions & face crop, ~150 MB one-time download)
4. Your browser will open automatically at **`http://localhost:3000`**.

### On Mac / Linux
1. Open Terminal inside the project folder.
2. Make the script executable and run it:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
3. Your browser will open at **`http://localhost:3000`**.

### Optional: Docker (If You Already Use Docker)
```bash
docker compose up --build
```
Then open `http://localhost:3000`.

---

## 2. How to Use Clip Maker

### Step 1: Add Your Video (Start Screen)
- **Option A — Paste a Link:** Paste a public YouTube, Facebook, or Twitch VOD URL.
- **Option B — Drop a File:** Drag and drop any `.mp4`, `.mov`, `.mkv`, `.webm`, or `.avi` file from your PC. *(If you provide both a link and a file, Clip Maker uses your file.)*
- **Option C — Built-in Test Video:** Click **Try Built-in Test Video** to test everything in seconds without needing any link or file.
- Check the permission box: *"I own this video or have permission from the creator to clip it."*

### Step 2: Pick a Mode
1. **Auto Mode:**
   - Choose **1 to 100 clips** (type a number or click quick buttons `3, 5, 10, 20, 50, 100`).
   - Pick clip length (`15s, 30s, 45s, 60s, 90s`, or `Auto`).
   - Clip Maker scores moments by loud reactions, laughter/burst cadence, questions, numbers, excitement phrases, chat spikes, and scene shifts — and honestly tells you if fewer strong moments exist in the video.
2. **Manual Mode:**
   - Opens the full video player with an **audio waveform timeline** and **searchable transcript**.
   - Add clips 5 ways:
     1. Click **Add Clip Here** while watching the video.
     2. **Drag across the waveform** to highlight a range.
     3. Type **Start** and **End** times (`mm:ss` or `hh:mm:ss`) and click **Add by Time**.
     4. Click any sentence in the **Transcript** to jump there or click **Clip from here** (edges snap cleanly to word boundaries).
     5. Click **Paste List** and paste ranges like:
        ```text
        02:10-02:45 Funny intro
        12:30-13:10 Best tip
        ```
3. **Mixed Mode:**
   - Finds the best moments automatically, then opens the Editor with **5 Runner-up Moments** you can swap in with one click before rendering.

### Step 3: Choose Style, Ratio & Voice
- **Ratios:** `9:16` (Reels/Shorts/TikTok), `1:1` (Square), `4:5` (Instagram Feed), `16:9` (YouTube), or check **Create all 4 ratios for every clip**.
- **Layouts:** Blur Background (default), Smart Face Crop, Split Screen (gameplay top + facecam bottom), or Solid Color Bars.
- **Captions:** 6 built-in presets (*Classic Yellow, Neon Green, Red Impact, Clean Minimal, Boxed Highlight, Karaoke Sweep*) + full custom editor, safe zones, auto-emoji, bad-word masking, and **Urdu / Arabic RTL** support.
- **Voice Perfect:** Automatically normalizes loudness to `-14 LUFS`, cleans low rumble, and optionally trims long silences.

### Step 4: Creating 100-Clip Batches Safely
1. Select **100** clips on the Start screen (or add up to 100 clips in Manual Editor).
2. Clip Maker renders **2 clips at a time** (adjustable 1–4 in Settings) so your PC does not freeze or run out of RAM.
3. Finished clips appear in **Results** one by one as soon as each finishes.
4. If you close the app or restart your PC mid-batch, Clip Maker automatically **resumes** queued clips when reopened.
5. Click **Download All (ZIP)** to stream all finished clips into one ZIP file with low memory usage.

### Step 5: Open on Your Phone (Same Wi-Fi)
Go to **Settings** → copy the **Open on your phone** address (for example `http://192.168.1.25:3000`) and open it in Safari or Chrome on your phone connected to the same Wi-Fi.

---

## 3. Fixing Common Problems

- **"Download blocked" on a YouTube or Facebook link:**
  1. Go to **Settings** → **Browser Cookies** and select **Chrome**, **Edge**, or **Firefox** (whichever browser you are signed into), then try again.
  2. Or copy the `yt-dlp` command shown on the error card, run it in your terminal, and drop the downloaded `.mp4` file onto the Start screen.
- **Slow rendering:**
  - In **Settings**, keep **Clips Rendered at Once** at `1` or `2`. If you have an NVIDIA, Intel, or Apple Mac GPU, Clip Maker uses hardware encoding automatically.
- **Wrong words in Urdu / Hindi / Arabic / Japanese captions:**
  - In **Settings**, set **Speech Caption Model** to **`small`** or **`medium`**, and pick the exact language (or **Urdu + English Mix**) on the Start screen.
  - You can also edit any word directly in the **Manual Editor → Transcript** panel before rendering.
- **Editable Excitement Keywords:**
  - Open `config/keywords.json` in any text editor to add your own English, Urdu, Hindi, Arabic, or Japanese trigger phrases.

---

## 4. What I Chose & Free Tools / Licenses Used

Because no paid APIs or cloud subscriptions are allowed, Clip Maker uses only 100% free, open-source local software:

| Tool / Library | Role | License |
|---|---|---|
| **Node.js + Express + React + Vite + Tailwind CSS** | Local web server & browser studio UI | MIT |
| **Node built-in SQLite (`node:sqlite`)** | Zero-setup local database & crash-resumable job queue | MIT |
| **FFmpeg + `libass`** | Video cutting, 4 layouts, `-14 LUFS` Voice Perfect audio, burned-in word-synced ASS captions | LGPL / GPL |
| **yt-dlp** | Public YouTube/Facebook/Twitch video & caption downloader | Unlicense (Public Domain) |
| **faster-whisper** *(optional local Python)* | Offline speech-to-text with word-level timestamps & GPU/CPU auto-detection | MIT |
| **OpenCV (`opencv-python-headless`)** *(optional local Python)* | Smoothed face-tracking smart crop | Apache 2.0 |
| **archiver** | Low-memory streaming ZIP export for 100-clip batches | MIT |
| **Noto Sans / Noto Sans Arabic / Noto Nastaliq Urdu / Montserrat / Anton** | Open-license caption fonts including RTL Urdu/Arabic | SIL Open Font License (OFL) |
| **Ollama** *(strictly optional local LLM)* | Optional local title/hook polish if already running on `localhost:11434` | MIT |

---

## 5. Optional Free Hosting Notes

YouTube and some video sites often block cloud datacenter IPs, which is why **running on your own PC is always best**. However, if you want to host Clip Maker for file-upload workflows on a free VPS (such as Oracle Cloud Always Free ARM/AMD VM or a spare home mini-PC):
1. Install Docker and run `docker compose up -d --build`.
2. Put a reverse proxy (Caddy/Nginx) with basic password protection in front of port `3000`.

---

## 6. Test Report (Verified Results)

All backend pipelines, FFmpeg rendering, caption burning, ratio exports, batch queue, and ZIP streaming were tested end-to-end on this Linux environment (2 vCPU, `libx264` software encoding, 42-second 1280×720 30fps sample MP4):

| Test Scenario | Result | Measured Timing / Output |
|---|---|---|
| **Built-in Sample Video + Auto Mode (requested 5 clips)** | Passed | 2 non-overlapping moments selected & rendered in **33.5s** (`1080×1920`, `30fps`, `h264 + aac`). Honestly reported: *"Only 2 strong non-overlapping moments found in this 00:42 video (you asked for 5)."* |
| **100-Clip Request Shortage Handling** | Passed | Requested 100 clips on 42s video; returned 2 distinct moments with clear shortage notice. |
| **Manual Mode + Urdu RTL Captions + All 4 Ratios (`9:16`, `1:1`, `4:5`, `16:9`)** | Passed | 3 pasted timestamp clips × 4 ratios = **12 clips** rendered with Urdu RTL (`Noto Sans Arabic`), Hook box, and `-14 LUFS` audio in **91.1s**. Verified exact output dimensions: `1080×1920`, `1080×1080`, `1080×1350`, `1920×1080`. |
| **All 4 Layouts (`blur`, `crop`, `split`, `solid`)** | Passed | Rendered and probed cleanly at `1080×1920` (`685 KB`, `311 KB`, `468 KB` for 3s clips). |
| **20-Clip Concurrent Batch Queue + Streaming ZIP** | Passed | **20/20 clips** completed with 2 parallel workers in **82.5s**; streaming ZIP returned `HTTP 200`, `17,759,237 bytes`, valid `PK` header. |
| **File Upload (`POST /api/projects/upload`)** | Passed | `HTTP 200`, streamed directly to disk, probed `42s` duration. |
| **Word-Boundary Snapping & Safety Validation** | Passed | Snapped clip edges to word/sentence boundaries (`0.4–11.4s`, `11.8–24.0s`); rejected missing permission checkbox and non-`http(s)` URLs (`file:///etc/passwd`). |
| **Build & TypeScript Check** | Passed | `npm run build` (`vite build`) and `npm run lint` (`tsc --noEmit`) passed with 0 errors; `node server.ts` started cleanly. |

### What Could Not Be Tested in This Sandbox
Because this cloud build container has `ffmpeg`/`ffprobe` and `node` 22, but does **not** have `yt-dlp`, `pip`, `faster-whisper`, `opencv`, `yamnet`, GPU hardware encoders (`nvenc`/`qsv`/`videotoolbox`), or Windows installed:
- Live public **YouTube / Facebook / Twitch URL download** via `yt-dlp` and browser cookie fallback were not executed live here.
- Local **`faster-whisper` transcription**, **OpenCV face-tracking**, **YAMNet laughter model**, and **Windows `start.bat`** execution were syntax-checked (`py_compile`, `bash -n`) and verified via graceful fallback (`capabilities` probe), and are set up to auto-install when you run `start.bat` (Windows) or `start.sh` (Mac/Linux) on your own computer.

