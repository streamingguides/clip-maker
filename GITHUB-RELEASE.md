# GitHub Release Plan — Clip Maker

Prepared locally. **Nothing has been pushed yet** — publishing needs the owner's go-ahead and a one-time `gh auth login`.

## Suggested repo names (pick one)

1. `clip-maker` — simple, exactly what the tool is called.
2. `clip-maker-studio` — sounds more like a full product (better for the paid version later).
3. `auto-clip-studio` — highlights the automatic best-moments feature for people searching GitHub.

## One-line repo description

> 100% free, local-first studio that turns long YouTube / Facebook / Twitch videos into ready-to-post Shorts, Reels & TikToks with word-synced captions — plus a Campaign Mode for Vyro & Content Rewards clippers.

## Suggested GitHub topics

`video-clipping` `youtube-shorts` `tiktok` `instagram-reels` `ffmpeg` `faster-whisper` `yt-dlp` `auto-captions` `content-rewards` `vyro` `clip-maker` `video-editor`

## Push commands (run when the owner says go)

```bash
cd ~/workspace/clip-maker-tool
gh auth login            # one-time, owner's GitHub account
gh repo create clip-maker --public --source=. --remote=origin --description "100% free, local-first auto clip studio with Campaign Mode (Vyro + Content Rewards presets)"
git branch -M main
git push -u origin main
```

(Repo name in the `gh repo create` line should match whichever name is picked above.)

## What "live" means — read this before expecting a website

- **GitHub "live" = download-and-run.** Putting this repo on GitHub means anyone can download the code and run Clip Maker **on their own computer** with `start.bat` / `start.sh` (or Docker). GitHub does not run the app — there is no public website where strangers open a link and clip in the browser.
- **A hosted browser version is a separate step.** It needs a server that runs 24/7 — for example a VPS, or a Hugging Face Space using the included `Dockerfile`. That server does the downloading, transcription, and rendering for every visitor, so it needs real CPU/RAM and storage.
- **Caveat for the hosted route:** YouTube and Facebook often block downloads from datacenter IPs, so link-based clipping can fail on a hosted server even when it works fine on a home PC. File-upload clipping still works hosted. This is why local-first stays the main model.

## License — owner's decision (no LICENSE file added yet)

- **Option A — MIT:** Anyone can use, copy, modify, and even sell the tool. Maximum sharing and stars, zero control kept.
- **Option B — Custom "free for personal use" license:** Anyone may download and use it free for their own clipping, but commercial use / reselling stays reserved for the owner.
- **Recommendation: Option B.** The owner's plan is to also *sell* this tool — MIT would let anyone else legally sell the same code the day it is published, while Option B keeps it free for users and keeps the selling rights with the owner.
