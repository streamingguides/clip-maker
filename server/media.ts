import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CACHE_DIR, TEMP_DIR } from './db.ts';
import type { SystemHealth } from '../src/shared/types.ts';

export interface CmdResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runCommandSafe(
  bin: string,
  args: string[],
  options?: {
    cwd?: string;
    timeoutMs?: number;
    onStderrLine?: (line: string) => void;
  }
): Promise<CmdResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: options?.cwd,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let stderrBuf = '';
    let timedOut = false;

    let timer: NodeJS.Timeout | undefined;
    if (options?.timeoutMs) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, options.timeoutMs);
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const str = chunk.toString('utf8');
      stderr += str;
      if (options?.onStderrLine) {
        stderrBuf += str;
        const lines = stderrBuf.split(/\r?\n/);
        stderrBuf = lines.pop() ?? '';
        for (const l of lines) {
          if (l.trim()) options.onStderrLine(l.trim());
        }
      }
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${err.message}` });
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (stderrBuf.trim() && options?.onStderrLine) {
        options.onStderrLine(stderrBuf.trim());
      }
      resolve({
        code: timedOut ? -2 : (code ?? 0),
        stdout,
        stderr,
      });
    });
  });
}

export function validateMediaUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only http:// and https:// video links are allowed.' };
    }
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return { ok: false, error: 'Please enter a complete website link.' };
    }
    return { ok: true, url: parsed.toString() };
  } catch {
    return { ok: false, error: 'This does not look like a valid video URL.' };
  }
}

export function hashString(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex').slice(0, 16);
}

export async function hashFileQuick(filePath: string): Promise<string> {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, 'r');
  try {
    const sampleSize = Math.min(65536, stat.size);
    const buf = Buffer.alloc(sampleSize);
    fs.readSync(fd, buf, 0, sampleSize, 0);
    const h = crypto.createHash('sha256');
    h.update(String(stat.size));
    h.update(String(Math.floor(stat.mtimeMs)));
    h.update(buf);
    return h.digest('hex').slice(0, 16);
  } finally {
    fs.closeSync(fd);
  }
}

let cachedYtDlpBin: { bin: string; prefixArgs: string[] } | null | undefined;

export async function resolveYtDlp(): Promise<{ bin: string; prefixArgs: string[] } | null> {
  if (cachedYtDlpBin !== undefined) return cachedYtDlpBin;

  const candidates: Array<{ bin: string; prefixArgs: string[] }> = [
    { bin: 'yt-dlp', prefixArgs: [] },
    { bin: path.resolve(process.cwd(), 'storage', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'), prefixArgs: [] },
    { bin: process.platform === 'win32' ? 'python' : 'python3', prefixArgs: ['-m', 'yt_dlp'] },
  ];

  for (const c of candidates) {
    const res = await runCommandSafe(c.bin, [...c.prefixArgs, '--version'], { timeoutMs: 4000 });
    if (res.code === 0 && res.stdout.trim()) {
      cachedYtDlpBin = c;
      return c;
    }
  }
  cachedYtDlpBin = null;
  return null;
}

let cachedPythonBin: string | null | undefined;
export async function resolvePython(): Promise<string | null> {
  if (cachedPythonBin !== undefined) return cachedPythonBin;
  const venvPy =
    process.platform === 'win32'
      ? path.resolve(process.cwd(), '.venv', 'Scripts', 'python.exe')
      : path.resolve(process.cwd(), '.venv', 'bin', 'python');
  for (const candidate of [venvPy, 'python3', 'python']) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    const res = await runCommandSafe(candidate, ['--version'], { timeoutMs: 3000 });
    if (res.code === 0) {
      cachedPythonBin = candidate;
      return candidate;
    }
  }
  cachedPythonBin = null;
  return null;
}

let cachedEncoder: string | null = null;
export async function detectHardwareEncoder(): Promise<string> {
  if (cachedEncoder) return cachedEncoder;
  const candidates =
    process.platform === 'darwin'
      ? ['h264_videotoolbox']
      : ['h264_nvenc', 'h264_qsv'];

  for (const enc of candidates) {
    const res = await runCommandSafe(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=128x128:d=0.2',
        '-c:v',
        enc,
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 5000 }
    );
    if (res.code === 0) {
      cachedEncoder = enc;
      return enc;
    }
  }
  cachedEncoder = 'libx264';
  return 'libx264';
}

export async function getSystemHealth(port: number): Promise<SystemHealth> {
  const [ffmpegRes, ffprobeRes, ytDlp, pyBin, encoder] = await Promise.all([
    runCommandSafe('ffmpeg', ['-version'], { timeoutMs: 3000 }),
    runCommandSafe('ffprobe', ['-version'], { timeoutMs: 3000 }),
    resolveYtDlp(),
    resolvePython(),
    detectHardwareEncoder(),
  ]);

  let fasterWhisper = false;
  let openCv = false;
  let yamnet = false;

  if (pyBin) {
    const workerPath = path.resolve(process.cwd(), 'scripts', 'worker.py');
    if (fs.existsSync(workerPath)) {
      const capRes = await runCommandSafe(pyBin, [workerPath, 'capabilities'], {
        timeoutMs: 6000,
      });
      if (capRes.code === 0) {
        try {
          const parsed = JSON.parse(capRes.stdout.trim()) as Record<string, boolean>;
          fasterWhisper = Boolean(parsed.faster_whisper);
          openCv = Boolean(parsed.opencv || parsed.mediapipe);
          yamnet = Boolean(parsed.yamnet);
        } catch {
          // ignore
        }
      }
    }
  }

  let ollama = false;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 800);
    const resp = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: controller.signal,
    });
    clearTimeout(t);
    ollama = resp.ok;
  } catch {
    ollama = false;
  }

  let diskFreeGb = 20;
  try {
    const stat = fs.statfsSync(process.cwd());
    diskFreeGb = Math.round(((stat.bavail * stat.bsize) / 1024 ** 3) * 10) / 10;
  } catch {
    // ignore
  }

  let localIp = 'localhost';
  const nets = os.networkInterfaces();
  for (const ifaceList of Object.values(nets)) {
    for (const iface of ifaceList ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
    if (localIp !== 'localhost') break;
  }

  return {
    ffmpeg: ffmpegRes.code === 0,
    ffprobe: ffprobeRes.code === 0,
    ytDlp: ytDlp !== null,
    fasterWhisper,
    openCv,
    yamnet,
    ollama,
    hardwareEncoder: encoder,
    diskFreeGb,
    localIp,
    port,
  };
}

export interface MediaProbe {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  title?: string;
  creatorName?: string;
  hasAudio: boolean;
}

export async function probeMedia(filePath: string): Promise<MediaProbe> {
  const res = await runCommandSafe(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { timeoutMs: 15000 }
  );
  if (res.code !== 0) {
    throw new Error('Could not read video file details with ffprobe.');
  }
  const data = JSON.parse(res.stdout) as {
    format?: { duration?: string; tags?: Record<string, string> };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      avg_frame_rate?: string;
      side_data_list?: Array<{ rotation?: number }>;
      tags?: Record<string, string>;
    }>;
  };
  const vStream = data.streams?.find((s) => s.codec_type === 'video');
  const aStream = data.streams?.find((s) => s.codec_type === 'audio');

  let width = vStream?.width ?? 1920;
  let height = vStream?.height ?? 1080;

  // Handle phone-rotated video metadata
  const rotTag = Number(vStream?.tags?.rotate ?? 0);
  const sideRot = Number(vStream?.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0);
  const rotation = Math.abs(rotTag || sideRot);
  if (rotation === 90 || rotation === 270) {
    [width, height] = [height, width];
  }

  let fps = 30;
  const rateStr = vStream?.avg_frame_rate || vStream?.r_frame_rate;
  if (rateStr && rateStr.includes('/')) {
    const [num, den] = rateStr.split('/').map(Number);
    if (den > 0 && num > 0) {
      fps = Math.min(120, Math.max(10, Math.round((num / den) * 100) / 100));
    }
  }

  return {
    durationSec: Number(data.format?.duration ?? 0),
    width,
    height,
    fps,
    title: data.format?.tags?.title,
    creatorName: data.format?.tags?.artist,
    hasAudio: Boolean(aStream),
  };
}

export interface YtDlpDownloadResult {
  videoPath: string;
  title: string;
  creatorName: string;
  subtitleFiles: string[];
  chatFile?: string;
}

export async function downloadWithYtDlp(
  url: string,
  cacheKey: string,
  cookiesBrowser: string,
  language: string,
  onProgress: (pct: number, msg: string) => void
): Promise<YtDlpDownloadResult> {
  const manualCmd = `yt-dlp -f "bv*[height<=1080]+ba/b[height<=1080]" --merge-output-format mp4 "${url}"`;
  const yt = await resolveYtDlp();
  if (!yt) {
    const err = new Error(
      'yt-dlp is not installed on this machine. Run start.bat / start.sh, or download this video manually and drop the file here.'
    ) as Error & { manualCommandHint?: string };
    err.manualCommandHint = manualCmd;
    throw err;
  }

  const outDir = path.join(CACHE_DIR, cacheKey);
  fs.mkdirSync(outDir, { recursive: true });

  // 1. Metadata check (detect live streams, private/DRM/members-only)
  onProgress(5, 'Checking video details...');
  const infoRes = await runCommandSafe(
    yt.bin,
    [...yt.prefixArgs, '--dump-single-json', '--no-playlist', '--no-warnings', url],
    { timeoutMs: 30000 }
  );

  let title = 'Online Video';
  let creatorName = 'Creator';
  if (infoRes.code === 0 && infoRes.stdout.trim()) {
    try {
      const info = JSON.parse(infoRes.stdout.trim()) as {
        title?: string;
        uploader?: string;
        channel?: string;
        is_live?: boolean;
        live_status?: string;
      };
      if (info.is_live || info.live_status === 'is_live') {
        throw new Error(
          'This live stream is still running. Please wait until the stream finishes, or record/upload the file directly.'
        );
      }
      title = info.title || title;
      creatorName = info.uploader || info.channel || creatorName;
    } catch (e) {
      if (e instanceof Error && e.message.includes('live stream')) throw e;
    }
  } else {
    const lowerErr = infoRes.stderr.toLowerCase();
    if (lowerErr.includes('drm') || lowerErr.includes('protected')) {
      throw new Error('This video is DRM-protected. Clip Maker cannot download DRM or paywalled videos.');
    }
    if (lowerErr.includes('private') || lowerErr.includes('members-only') || lowerErr.includes('join this channel')) {
      throw new Error('This video is private or members-only. Clip Maker only supports public videos or videos you have downloaded yourself.');
    }
  }

  const outTemplate = path.join(outDir, 'source.%(ext)s');
  const subLangs = language && language !== 'auto' && language !== 'ur-en' ? `${language},en` : 'en,ur,hi,ar,ja';

  const baseArgs = [
    ...yt.prefixArgs,
    '--no-playlist',
    '--newline',
    '-f',
    'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b',
    '--merge-output-format',
    'mp4',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    subLangs,
    '--sub-format',
    'json3/vtt',
    '-o',
    outTemplate,
  ];

  const attemptDownload = async (extraArgs: string[], label: string) => {
    onProgress(12, label);
    return runCommandSafe(yt.bin, [...baseArgs, ...extraArgs, url], {
      timeoutMs: 15 * 60 * 1000,
      onStderrLine: (line) => {
        const m = line.match(/(\d+(?:\.\d+)?)%/);
        if (m) {
          const p = Math.min(95, Math.max(12, Math.round(12 + Number(m[1]) * 0.78)));
          onProgress(p, `Downloading video (${Math.round(Number(m[1]))}%)...`);
        }
      },
    });
  };

  // (a) Normal attempt
  let dlRes = await attemptDownload([], 'Downloading video (normal)...');

  // (b) Cookies from browser if blocked
  if (dlRes.code !== 0) {
    const browsers =
      cookiesBrowser && cookiesBrowser !== 'none'
        ? [cookiesBrowser]
        : ['chrome', 'edge', 'firefox'];
    for (const browser of browsers) {
      dlRes = await attemptDownload(
        ['--cookies-from-browser', browser],
        `Retrying with ${browser} cookies...`
      );
      if (dlRes.code === 0) break;
    }
  }

  // (c) Update yt-dlp and retry
  if (dlRes.code !== 0) {
    onProgress(18, 'Updating yt-dlp and retrying...');
    await runCommandSafe(yt.bin, [...yt.prefixArgs, '-U'], { timeoutMs: 30000 });
    dlRes = await attemptDownload([], 'Retrying after yt-dlp update...');
  }

  // (d) Friendly fallback message
  if (dlRes.code !== 0) {
    const err = new Error(
      'The website blocked automatic download. Download this video manually and drop the file here.'
    ) as Error & { manualCommandHint?: string };
    err.manualCommandHint = manualCmd;
    throw err;
  }

  const files = fs.readdirSync(outDir);
  const videoFile =
    files.find((f) => f === 'source.mp4') ||
    files.find((f) => /\.(mp4|mkv|webm|mov)$/i.test(f));

  if (!videoFile) {
    const err = new Error(
      'Download finished but no video file was found. Download this video manually and drop the file here.'
    ) as Error & { manualCommandHint?: string };
    err.manualCommandHint = manualCmd;
    throw err;
  }

  const subtitleFiles = files
    .filter((f) => /\.(json3|vtt)$/i.test(f) && !f.includes('live_chat'))
    .map((f) => path.join(outDir, f));
  const chatFileName = files.find((f) => f.includes('live_chat'));

  return {
    videoPath: path.join(outDir, videoFile),
    title,
    creatorName,
    subtitleFiles,
    chatFile: chatFileName ? path.join(outDir, chatFileName) : undefined,
  };
}

export interface AudioAnalysisResult {
  wavPath: string;
  energyHalfSec: number[]; // RMS energy 0..1 per 0.5s
  waveformPeaks: number[]; // 240 normalized peaks 0..1 for timeline
  silences: Array<{ start: number; end: number }>;
  sceneChanges: number[]; // timestamps in seconds
  hasAudioSignal: boolean;
}

export async function analyzeAudioAndScenes(
  videoPath: string,
  cacheKey: string,
  durationSec: number,
  hasAudio: boolean
): Promise<AudioAnalysisResult> {
  const wavPath = path.join(TEMP_DIR, `audio_${cacheKey}.wav`);
  const energyHalfSec: number[] = [];
  const silences: Array<{ start: number; end: number }> = [];
  let hasAudioSignal = false;

  if (hasAudio) {
    if (!fs.existsSync(wavPath)) {
      await runCommandSafe(
        'ffmpeg',
        ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wavPath],
        { timeoutMs: 120000 }
      );
    }

    if (fs.existsSync(wavPath)) {
      // Stream WAV in chunks so 4+ hour videos stay low-memory!
      const fd = fs.openSync(wavPath, 'r');
      const headerOffset = 44;
      const sampleRate = 16000;
      const bytesPerHalfSec = sampleRate * 2 * 0.5; // 16000 bytes per 0.5s
      const buf = Buffer.alloc(bytesPerHalfSec);
      const stat = fs.statSync(wavPath);
      let pos = headerOffset;
      let maxRms = 0.0001;
      const rawRms: number[] = [];

      while (pos < stat.size) {
        const bytesRead = fs.readSync(fd, buf, 0, bytesPerHalfSec, pos);
        if (bytesRead <= 1) break;
        pos += bytesRead;
        let sumSq = 0;
        const count = Math.floor(bytesRead / 2);
        for (let i = 0; i < count; i++) {
          const sample = buf.readInt16LE(i * 2) / 32768;
          sumSq += sample * sample;
        }
        const rms = Math.sqrt(sumSq / Math.max(1, count));
        rawRms.push(rms);
        if (rms > maxRms) maxRms = rms;
      }
      fs.closeSync(fd);

      hasAudioSignal = maxRms > 0.004;
      for (const r of rawRms) {
        energyHalfSec.push(Math.min(1, r / maxRms));
      }

      // Silence detection with ffmpeg
      const silRes = await runCommandSafe(
        'ffmpeg',
        ['-i', wavPath, '-af', 'silencedetect=noise=-32dB:d=0.45', '-f', 'null', '-'],
        { timeoutMs: 60000 }
      );
      let curStart: number | null = null;
      for (const line of silRes.stderr.split(/\r?\n/)) {
        const mStart = line.match(/silence_start:\s*([\d.]+)/);
        if (mStart) curStart = Number(mStart[1]);
        const mEnd = line.match(/silence_end:\s*([\d.]+)/);
        if (mEnd && curStart !== null) {
          silences.push({ start: curStart, end: Number(mEnd[1]) });
          curStart = null;
        }
      }
    }
  }

  // Build 240-point waveform for timeline UI
  const targetPoints = 240;
  const waveformPeaks: number[] = [];
  if (energyHalfSec.length > 0) {
    const step = energyHalfSec.length / targetPoints;
    for (let i = 0; i < targetPoints; i++) {
      const a = Math.floor(i * step);
      const b = Math.min(energyHalfSec.length, Math.max(a + 1, Math.floor((i + 1) * step)));
      let peak = 0;
      for (let j = a; j < b; j++) {
        if (energyHalfSec[j] > peak) peak = energyHalfSec[j];
      }
      waveformPeaks.push(Math.round(peak * 1000) / 1000);
    }
  } else {
    for (let i = 0; i < targetPoints; i++) waveformPeaks.push(0.15);
  }

  // Scene detection (downscaled to 320px wide for speed & low RAM)
  const sceneChanges: number[] = [];
  const sceneRes = await runCommandSafe(
    'ffmpeg',
    [
      '-i',
      videoPath,
      '-vf',
      "fps=2,scale=320:-2,select='gt(scene,0.32)',showinfo",
      '-f',
      'null',
      '-',
    ],
    { timeoutMs: 90000 }
  );
  for (const line of sceneRes.stderr.split(/\r?\n/)) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) {
      const t = Number(m[1]);
      if (t > 0 && t < durationSec) sceneChanges.push(Math.round(t * 10) / 10);
    }
  }

  return {
    wavPath,
    energyHalfSec,
    waveformPeaks,
    silences,
    sceneChanges,
    hasAudioSignal,
  };
}

export async function generateSampleVideo(outPath: string): Promise<void> {
  // Generates a real 42-second 1280x720 H.264/AAC sample video locally via ffmpeg
  // with distinct high-energy visual scenes and dynamic audio bursts + pauses!
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const filterComplex = [
    "testsrc2=size=1280x720:rate=30:duration=42[v]",
    "sine=frequency=220:sample_rate=44100:duration=42,volume='if(lt(mod(t,10),3),0.85,if(lt(mod(t,10),5),0.05,0.45))':eval=frame[a1]",
    "sine=frequency=440:sample_rate=44100:duration=42,volume='if(between(mod(t,10),1,2.8),0.75,0.08)':eval=frame[a2]",
    "[a1][a2]amix=inputs=2:duration=shortest[a]",
  ].join(';');

  const res = await runCommandSafe(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=16x16:d=0.1',
      '-filter_complex',
      filterComplex,
      '-map',
      '[v]',
      '-map',
      '[a]',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { timeoutMs: 60000 }
  );

  if (res.code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(`Failed to generate local sample video: ${res.stderr.slice(-300)}`);
  }
}
