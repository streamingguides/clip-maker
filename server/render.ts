import fs from 'node:fs';
import path from 'node:path';
import { loadKeywordsConfig } from './moments.ts';
import {
  detectHardwareEncoder,
  resolvePython,
  runCommandSafe,
} from './media.ts';
import { OUTPUTS_DIR, TEMP_DIR } from './db.ts';
import {
  formatTimeShortFile,
  getDimensionsForRatio,
} from '../src/shared/styles.ts';
import type {
  AspectRatio,
  CaptionStyleConfig,
  ClipItem,
  ClipStyleConfig,
  ProjectRecord,
  TranscriptWord,
} from '../src/shared/types.ts';

function hexToAssColor(hex: string, alpha = 0): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 6) {
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
    return `&H${a}${b}${g}${r}`.toUpperCase();
  }
  return '&H00FFFFFF';
}

function formatAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  const whole = Math.floor(rem);
  const cs = Math.min(99, Math.round((rem - whole) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, '\\N');
}

function maskProfanityWord(word: string, list: string[]): string {
  const lower = word.toLowerCase().replace(/[^a-z]/g, '');
  if (list.includes(lower) && word.length >= 3) {
    return `${word[0]}${'*'.repeat(word.length - 1)}`;
  }
  return word;
}

function pickEmojiForPhrase(phrase: string): string {
  const cfg = loadKeywordsConfig();
  const lower = phrase.toLowerCase();
  for (const [key, terms] of Object.entries(cfg.emojiMap)) {
    if (terms.some((t) => lower.includes(t))) {
      return cfg.emojiChars[key] || '';
    }
  }
  return '';
}

function resolveFontForAss(cap: CaptionStyleConfig): string {
  if (cap.rtl) return 'Noto Sans Arabic';
  if (cap.fontFamily === 'Anton') return 'Liberation Sans';
  if (cap.fontFamily === 'Montserrat') return 'Noto Sans';
  return cap.fontFamily || 'Noto Sans';
}

export function generateAssSubtitleFile(opts: {
  assPath: string;
  clip: ClipItem;
  project: ProjectRecord;
  style: ClipStyleConfig;
  width: number;
  height: number;
}): void {
  const { assPath, clip, project, style, width, height } = opts;
  const cap = style.captions;
  const kwCfg = loadKeywordsConfig();
  const clipDuration = Math.max(0.5, clip.endTime - clip.startTime);

  const scaleFactor = Math.min(width / 1080, height / 1920);
  const scaledFontSize = Math.max(24, Math.round(cap.fontSize * (width === 1920 ? 0.62 : Math.max(0.75, scaleFactor))));
  const fontName = resolveFontForAss(cap);
  const primaryAss = hexToAssColor(cap.primaryColor, 0);
  const highlightAss = hexToAssColor(cap.highlightColor, 0);
  const outlineAss = hexToAssColor(cap.outlineColor, 0);
  const hasBox = cap.presetId === 'boxed-highlight' || (cap.boxColor && !cap.boxColor.endsWith(',0)'));
  const borderStyle = hasBox ? 3 : 1;
  const backAss = hasBox ? hexToAssColor('#0F172A', 0.2) : '&H80000000';

  // Safe zones: keep captions away from top 8% and bottom 15%
  let alignment = 2; // bottom-center
  let marginV = Math.round(height * 0.16);
  if (cap.position === 'middle') {
    alignment = 5;
    marginV = 0;
  } else if (cap.position === 'top') {
    alignment = 8;
    marginV = Math.round(height * 0.14);
  }

  const hookFontSize = Math.max(24, Math.round(width * 0.038));
  const hookMarginV = Math.round(height * 0.085);
  const creditFontSize = Math.max(16, Math.round(width * 0.022));
  const creditMarginV = Math.round(height * 0.035);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${fontName},${scaledFontSize},${primaryAss},${highlightAss},${outlineAss},${backAss},-1,0,0,0,100,100,0,0,${borderStyle},${cap.outlineWidth},2,${alignment},48,48,${marginV},1
Style: Hook,${fontName},${hookFontSize},${hexToAssColor(style.hook.textColor)},&H00FFFFFF,${hexToAssColor(style.hook.bgColor)},${hexToAssColor(style.hook.bgColor, 0.12)},-1,0,0,0,100,100,0,0,3,14,0,8,56,56,${hookMarginV},1
Style: Credit,Noto Sans,${creditFontSize},&H33FFFFFF,&H00FFFFFF,&HAA000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,32,32,${creditMarginV},1
Style: Disclosure,Noto Sans,${creditFontSize},&HFFFFFFFF,&H00FFFFFF,&HAA000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,1,3,32,32,${creditMarginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines: string[] = [];

  // Hook banner (first 3-5 seconds)
  if (style.hook.enabled && clip.hookText.trim()) {
    const hookDur = Math.min(clipDuration, Math.max(2, style.hook.durationSec || 4));
    lines.push(
      `Dialogue: 2,${formatAssTime(0)},${formatAssTime(hookDur)},Hook,,0,0,0,,{\\fad(120,200)}${escapeAssText(clip.hookText.trim())}`
    );
  }

  // Source credit
  if (style.showCredit && project.creatorName.trim()) {
    lines.push(
      `Dialogue: 1,${formatAssTime(0)},${formatAssTime(clipDuration)},Credit,,0,0,0,,Source: ${escapeAssText(project.creatorName.trim())}`
    );
  }

  // Vyro Campaign Mode: disclosure (e.g. "#ad") burned for the WHOLE clip.
  // It comes from the campaign preset via the project style, so it cannot be
  // silently dropped per clip.
  if (style.disclosureText && style.disclosureText.trim()) {
    lines.push(
      `Dialogue: 4,${formatAssTime(0)},${formatAssTime(clipDuration)},Disclosure,,0,0,0,,${escapeAssText(style.disclosureText.trim())}`
    );
  }

  // Word-synced captions
  if (cap.enabled && project.hasSpeech && project.transcript.length > 0) {
    const clipWords: TranscriptWord[] = [];
    for (const seg of project.transcript) {
      if (seg.end < clip.startTime || seg.start > clip.endTime) continue;
      if (seg.words.length > 0) {
        for (const w of seg.words) {
          if (w.end >= clip.startTime && w.start <= clip.endTime) {
            clipWords.push(w);
          }
        }
      } else {
        const tokens = seg.text.split(/\s+/).filter(Boolean);
        const step = (seg.end - seg.start) / Math.max(1, tokens.length);
        tokens.forEach((tok, idx) => {
          const s = seg.start + idx * step;
          const e = s + step;
          if (e >= clip.startTime && s <= clip.endTime) {
            clipWords.push({ id: `${seg.id}_${idx}`, word: tok, start: s, end: e });
          }
        });
      }
    }

    const chunkSize = Math.max(1, Math.min(4, cap.wordsPerLine || 3));
    for (let i = 0; i < clipWords.length; i += chunkSize) {
      const group = clipWords.slice(i, i + chunkSize);
      if (group.length === 0) continue;

      const normalizedGroup = group.map((w) => {
        let text = w.word.trim();
        if (cap.maskProfanity) text = maskProfanityWord(text, kwCfg.profanity);
        if (cap.uppercase && !cap.rtl) text = text.toUpperCase();
        return {
          text,
          start: Math.max(0, w.start - clip.startTime),
          end: Math.min(clipDuration, Math.max(0.08, w.end - clip.startTime)),
        };
      });

      const phraseText = normalizedGroup.map((g) => g.text).join(' ');
      const emoji = cap.autoEmoji ? pickEmojiForPhrase(phraseText) : '';

      if (cap.presetId === 'karaoke-sweep') {
        const gStart = normalizedGroup[0].start;
        const gEnd = Math.max(gStart + 0.15, normalizedGroup[normalizedGroup.length - 1].end);
        const karaokeTokens = normalizedGroup
          .map((g) => {
            const cs = Math.max(8, Math.round((g.end - g.start) * 100));
            return `{\\kf${cs}}${escapeAssText(g.text)}`;
          })
          .join(' ');
        const suffix = emoji ? ` ${emoji}` : '';
        lines.push(
          `Dialogue: 3,${formatAssTime(gStart)},${formatAssTime(gEnd)},Caption,,0,0,0,,{\\r}${karaokeTokens}${suffix}`
        );
      } else {
        // Active word highlight event per word in chunk (within ~50ms accuracy!)
        for (let activeIdx = 0; activeIdx < normalizedGroup.length; activeIdx++) {
          const wStart = normalizedGroup[activeIdx].start;
          const nextStart =
            activeIdx + 1 < normalizedGroup.length
              ? normalizedGroup[activeIdx + 1].start
              : normalizedGroup[activeIdx].end;
          const wEnd = Math.max(wStart + 0.08, nextStart);
          if (wStart >= clipDuration) continue;

          const formattedWords = normalizedGroup.map((g, k) => {
            const safeWord = escapeAssText(g.text);
            if (k === activeIdx) {
              return `{\\1c${highlightAss}\\fscx108\\fscy108}${safeWord}{\\1c${primaryAss}\\fscx100\\fscy100}`;
            }
            return safeWord;
          });
          const suffix = emoji ? ` ${emoji}` : '';
          lines.push(
            `Dialogue: 3,${formatAssTime(wStart)},${formatAssTime(Math.min(clipDuration, wEnd))},Caption,,0,0,0,,${formattedWords.join(' ')}${suffix}`
          );
        }
      }
    }
  }

  fs.writeFileSync(assPath, header + lines.join('\n') + '\n', 'utf8');
}

function escapeFilterPath(p: string): string {
  // Escape colons and backslashes for ffmpeg ass='...' filter on Windows & POSIX
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export async function renderSingleClip(opts: {
  clip: ClipItem;
  project: ProjectRecord;
  ratioOverride?: AspectRatio;
  onProgress?: (pct: number) => void;
}): Promise<{ outputPath: string; thumbnailPath: string; fileSizeBytes: number }> {
  const { clip, project, ratioOverride, onProgress } = opts;
  const style: ClipStyleConfig = {
    ...(clip.styleOverride ?? project.style),
    ratio: ratioOverride ?? clip.ratio ?? project.style.ratio,
  };

  if (!project.sourcePath || !fs.existsSync(project.sourcePath)) {
    throw new Error('Source video file is missing from disk.');
  }

  const { width, height } = getDimensionsForRatio(style.ratio);
  const clipDur = Math.max(1, clip.endTime - clip.startTime);

  const projectOutDir = path.join(OUTPUTS_DIR, project.id);
  fs.mkdirSync(projectOutDir, { recursive: true });

  const idxStr = String(clip.orderIndex + 1).padStart(3, '0');
  const ratioSlug = style.ratio.replace(':', 'x');
  const fileBase = `clip-${idxStr}_${formatTimeShortFile(clip.startTime)}_score${clip.score}_${ratioSlug}`;
  const outputPath = path.join(projectOutDir, `${fileBase}.mp4`);
  const thumbnailPath = path.join(projectOutDir, `${fileBase}.jpg`);
  const assPath = path.join(TEMP_DIR, `subs_${clip.id}_${ratioSlug}.ass`);

  generateAssSubtitleFile({
    assPath,
    clip,
    project,
    style,
    width,
    height,
  });

  // Optional face tracking for 'crop' layout
  let cropCx = 0.5;
  let cropCy = 0.45;
  if (style.layout === 'crop') {
    const py = await resolvePython();
    const workerPath = path.resolve(process.cwd(), 'scripts', 'worker.py');
    if (py && fs.existsSync(workerPath)) {
      const ft = await runCommandSafe(
        py,
        [workerPath, 'face_track', project.sourcePath, String(clip.startTime), String(clip.endTime)],
        { timeoutMs: 25000 }
      );
      if (ft.code === 0 && ft.stdout.trim()) {
        try {
          const parsed = JSON.parse(ft.stdout.trim()) as { ok?: boolean; cx?: number; cy?: number };
          if (parsed.ok && parsed.cx != null && parsed.cy != null) {
            cropCx = parsed.cx;
            cropCy = parsed.cy;
          }
        } catch {
          // use default center
        }
      }
    }
  }

  // Build video filtergraph
  const vFilters: string[] = [];
  const srcW = Math.max(2, project.width || 1920);
  const srcH = Math.max(2, project.height || 1080);

  if (style.layout === 'blur') {
    const bw = Math.max(64, Math.floor(width / 8) * 2);
    const bh = Math.max(64, Math.floor(height / 8) * 2);
    vFilters.push(
      `[0:v]fps=30,split=2[bg_in][fg_in]`,
      `[bg_in]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=6:2,scale=${width}:${height}[bg]`,
      `[fg_in]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2[canvas]`
    );
  } else if (style.layout === 'crop') {
    const targetAspect = width / height;
    const srcAspect = srcW / srcH;
    let cw = srcW;
    let ch = srcH;
    if (srcAspect > targetAspect) {
      cw = Math.floor((srcH * targetAspect) / 2) * 2;
    } else {
      ch = Math.floor((srcW / targetAspect) / 2) * 2;
    }
    const cxPx = Math.max(0, Math.min(srcW - cw, Math.round(cropCx * srcW - cw / 2)));
    const cyPx = Math.max(0, Math.min(srcH - ch, Math.round(cropCy * srcH - ch / 2)));
    vFilters.push(
      `[0:v]fps=30,crop=${cw}:${ch}:${cxPx}:${cyPx},scale=${width}:${height}[canvas]`
    );
  } else if (style.layout === 'split') {
    const topH = Math.floor(height / 2 / 2) * 2;
    const botH = height - topH;
    const t = style.split.top;
    const b = style.split.bottom;
    const tx = Math.max(0, Math.round(t.x * srcW));
    const ty = Math.max(0, Math.round(t.y * srcH));
    const tw = Math.max(32, Math.floor((t.w * srcW) / 2) * 2);
    const th = Math.max(32, Math.floor((t.h * srcH) / 2) * 2);
    const bx = Math.max(0, Math.round(b.x * srcW));
    const by = Math.max(0, Math.round(b.y * srcH));
    const bw = Math.max(32, Math.floor((b.w * srcW) / 2) * 2);
    const bh = Math.max(32, Math.floor((b.h * srcH) / 2) * 2);
    vFilters.push(
      `[0:v]fps=30,split=2[s1][s2]`,
      `[s1]crop=min(${tw}\\,iw-${tx}):min(${th}\\,ih-${ty}):${tx}:${ty},scale=${width}:${topH}:force_original_aspect_ratio=increase,crop=${width}:${topH}[topv]`,
      `[s2]crop=min(${bw}\\,iw-${bx}):min(${bh}\\,ih-${by}):${bx}:${by},scale=${width}:${botH}:force_original_aspect_ratio=increase,crop=${width}:${botH}[botv]`,
      `[topv][botv]vstack=inputs=2[canvas]`
    );
  } else {
    // Solid / dark bar layout
    const bgHex = (style.solidBgColor || '#0F172A').replace('#', '0x');
    vFilters.push(
      `color=c=${bgHex}:s=${width}x${height}:r=30[bg]`,
      `[0:v]fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1[canvas]`
    );
  }

  let currentLabel = 'canvas';
  if (style.showProgressBar) {
    const barColor = (style.progressBarColor || '#FACC15').replace('#', '0x');
    const barH = Math.max(6, Math.round(height * 0.005));
    const barY = height - barH;
    // Animated progress bar using overlay x expression
    vFilters.push(
      `color=c=${barColor}:s=${width}x${barH}:r=30[pbar]`,
      `[${currentLabel}][pbar]overlay=x='-W+(W*min(1\\,t/${clipDur.toFixed(2)}))':y=${barY}:shortest=1[withbar]`
    );
    currentLabel = 'withbar';
  }

  const assEscaped = escapeFilterPath(assPath);
  vFilters.push(`[${currentLabel}]setsar=1,ass='${assEscaped}'[vout]`);

  // Audio filters ("Voice Perfect")
  const aFilters: string[] = [];
  if (style.audio.cleanVoice) {
    aFilters.push('highpass=f=80', 'acompressor=threshold=-20dB:ratio=3:attack=5:release=50');
  }
  if (style.audio.trimSilences) {
    aFilters.push('silenceremove=stop_periods=-1:stop_duration=0.7:stop_threshold=-38dB');
  }
  if (style.audio.normalizeLoudness) {
    aFilters.push('loudnorm=I=-14:TP=-1.5:LRA=11');
  }
  const hasAudioFilter = aFilters.length > 0;

  const encoder = await detectHardwareEncoder();
  const videoCodecArgs =
    encoder === 'libx264'
      ? ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-maxrate', '6M', '-bufsize', '12M']
      : ['-c:v', encoder, '-b:v', '4M'];

  const ffArgs = [
    '-y',
    '-ss',
    clip.startTime.toFixed(3),
    '-t',
    clipDur.toFixed(3),
    '-i',
    project.sourcePath,
    '-filter_complex',
    vFilters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '0:a?',
    ...videoCodecArgs,
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
  ];

  if (hasAudioFilter) {
    ffArgs.push('-af', aFilters.join(','));
  }

  ffArgs.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', outputPath);

  const renderRes = await runCommandSafe('ffmpeg', ffArgs, {
    timeoutMs: 10 * 60 * 1000,
    onStderrLine: (line) => {
      const m = line.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m && onProgress) {
        const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
        const pct = Math.min(96, Math.max(5, Math.round((secs / clipDur) * 100)));
        onProgress(pct);
      }
    },
  });

  if (renderRes.code !== 0 || !fs.existsSync(outputPath)) {
    throw new Error(`FFmpeg render failed: ${renderRes.stderr.slice(-350)}`);
  }

  // Generate thumbnail JPEG
  const thumbSec = Math.min(clipDur * 0.4, 1.5);
  await runCommandSafe(
    'ffmpeg',
    ['-y', '-ss', thumbSec.toFixed(2), '-i', outputPath, '-vframes', '1', '-q:v', '3', thumbnailPath],
    { timeoutMs: 15000 }
  );

  const stat = fs.statSync(outputPath);
  try {
    if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
  } catch {
    // ignore cleanup error
  }

  if (onProgress) onProgress(100);
  return {
    outputPath,
    thumbnailPath: fs.existsSync(thumbnailPath) ? thumbnailPath : '',
    fileSizeBytes: stat.size,
  };
}
