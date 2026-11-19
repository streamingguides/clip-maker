import fs from 'node:fs';
import path from 'node:path';
import { resolvePython, runCommandSafe, type AudioAnalysisResult } from './media.ts';
import type { TranscriptSegment, TranscriptWord } from '../src/shared/types.ts';

function parseVttTime(ts: string): number {
  const clean = ts.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(clean) || 0;
}

export function parseJson3Subtitles(filePath: string): TranscriptSegment[] {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      events?: Array<{
        tStartMs?: number;
        dDurationMs?: number;
        segs?: Array<{ utf8?: string; tOffsetMs?: number }>;
      }>;
    };
    const segments: TranscriptSegment[] = [];
    let segIdx = 0;

    for (const ev of raw.events ?? []) {
      if (!ev.segs || ev.tStartMs == null) continue;
      const baseStart = ev.tStartMs / 1000;
      const segDur = (ev.dDurationMs ?? 3000) / 1000;
      const words: TranscriptWord[] = [];

      for (let i = 0; i < ev.segs.length; i++) {
        const s = ev.segs[i];
        const rawText = (s.utf8 ?? '').replace(/\n+/g, ' ').trim();
        if (!rawText) continue;
        const wStart = baseStart + (s.tOffsetMs ?? 0) / 1000;
        const nextOffset =
          i + 1 < ev.segs.length && ev.segs[i + 1].tOffsetMs != null
            ? baseStart + (ev.segs[i + 1].tOffsetMs ?? 0) / 1000
            : baseStart + segDur;
        const splitWords = rawText.split(/\s+/).filter(Boolean);
        const step = Math.max(0.12, (nextOffset - wStart) / Math.max(1, splitWords.length));
        splitWords.forEach((w, j) => {
          words.push({
            id: `j3_${segIdx}_${words.length}`,
            word: w,
            start: Math.round((wStart + j * step) * 1000) / 1000,
            end: Math.round((wStart + (j + 1) * step) * 1000) / 1000,
          });
        });
      }

      if (words.length > 0) {
        segments.push({
          id: `seg_${segIdx++}`,
          start: words[0].start,
          end: words[words.length - 1].end,
          text: words.map((w) => w.word).join(' '),
          words,
        });
      }
    }
    return segments;
  } catch {
    return [];
  }
}

export function parseVttSubtitles(filePath: string): TranscriptSegment[] {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const blocks = content.split(/\r?\n\r?\n+/);
    const segments: TranscriptSegment[] = [];
    let idx = 0;

    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
      if (timeLineIdx === -1) continue;
      const match = lines[timeLineIdx].match(/([\d:.]+)\s+-->\s+([\d:.]+)/);
      if (!match) continue;
      const start = parseVttTime(match[1]);
      const end = Math.max(start + 0.3, parseVttTime(match[2]));
      const text = lines
        .slice(timeLineIdx + 1)
        .join(' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) continue;

      const rawWords = text.split(/\s+/).filter(Boolean);
      const step = Math.max(0.12, (end - start) / Math.max(1, rawWords.length));
      const words: TranscriptWord[] = rawWords.map((w, j) => ({
        id: `vtt_${idx}_${j}`,
        word: w,
        start: Math.round((start + j * step) * 1000) / 1000,
        end: Math.round((start + (j + 1) * step) * 1000) / 1000,
      }));

      segments.push({
        id: `seg_${idx++}`,
        start,
        end,
        text,
        words,
      });
    }
    return segments;
  } catch {
    return [];
  }
}

export function buildSampleTranscript(durationSec: number): TranscriptSegment[] {
  const lines = [
    { start: 0.4, end: 5.2, text: 'Wait until you see the biggest mistake creators make with short clips!' },
    { start: 5.6, end: 11.4, text: 'Most people spend 3 hours editing when 90 seconds of the right hook wins.' },
    { start: 11.8, end: 17.5, text: 'Oh my god look at that jump at twelve seconds, that is insane!' },
    { start: 18.0, end: 24.0, text: 'Here is the secret: snap every caption to the exact word boundary.' },
    { start: 24.6, end: 30.8, text: 'Kamaal ka result milta hai jab audio -14 LUFS par clean aur loud ho!' },
    { start: 31.4, end: Math.min(41.5, durationSec), text: 'No way! You can export 100 clips in one free batch right on your own PC.' },
  ];

  return lines
    .filter((l) => l.start < durationSec)
    .map((l, idx) => {
      const end = Math.min(durationSec, l.end);
      const tokens = l.text.split(/\s+/);
      const step = (end - l.start) / Math.max(1, tokens.length);
      return {
        id: `sample_seg_${idx}`,
        start: l.start,
        end,
        text: l.text,
        words: tokens.map((w, j) => ({
          id: `sw_${idx}_${j}`,
          word: w,
          start: Math.round((l.start + j * step) * 1000) / 1000,
          end: Math.round((l.start + (j + 1) * step) * 1000) / 1000,
        })),
      };
    });
}

export interface TranscribeOutput {
  segments: TranscriptSegment[];
  hasSpeech: boolean;
  detectedLanguage: string;
  notice?: string;
}

export async function transcribeMedia(opts: {
  subtitleFiles: string[];
  audioAnalysis: AudioAnalysisResult;
  whisperModel: string;
  language: string;
  isSample?: boolean;
  durationSec: number;
}): Promise<TranscribeOutput> {
  if (opts.isSample) {
    return {
      segments: buildSampleTranscript(opts.durationSec),
      hasSpeech: true,
      detectedLanguage: 'en',
    };
  }

  // 1. Existing YouTube captions (fast & free)
  for (const sub of opts.subtitleFiles) {
    const parsed = sub.endsWith('.json3')
      ? parseJson3Subtitles(sub)
      : parseVttSubtitles(sub);
    if (parsed.length > 0) {
      return {
        segments: parsed,
        hasSpeech: true,
        detectedLanguage: opts.language === 'auto' ? 'en' : opts.language,
      };
    }
  }

  // 2. Local faster-whisper via Python worker
  const py = await resolvePython();
  if (py && fs.existsSync(opts.audioAnalysis.wavPath)) {
    const workerPath = path.resolve(process.cwd(), 'scripts', 'worker.py');
    const res = await runCommandSafe(
      py,
      [workerPath, 'transcribe', opts.audioAnalysis.wavPath, opts.whisperModel, opts.language],
      { timeoutMs: 30 * 60 * 1000 }
    );
    if (res.code === 0 && res.stdout.trim()) {
      try {
        const parsed = JSON.parse(res.stdout.trim()) as {
          ok: boolean;
          language?: string;
          segments?: TranscriptSegment[];
          error?: string;
        };
        if (parsed.ok && parsed.segments) {
          const hasSpeech = parsed.segments.length > 0;
          return {
            segments: parsed.segments,
            hasSpeech,
            detectedLanguage: parsed.language ?? opts.language,
            notice: hasSpeech
              ? undefined
              : 'No speech was detected in this video. Using audio energy & scene signals instead, and turning captions off.',
          };
        }
      } catch {
        // fall through
      }
    }
  }

  // 3. Fallback when faster-whisper is not installed or no speech track exists
  const hasAudio = opts.audioAnalysis.hasAudioSignal;
  if (!hasAudio) {
    return {
      segments: [],
      hasSpeech: false,
      detectedLanguage: opts.language,
      notice:
        'No speech track detected (silent or music-only video). Moments were selected using visual scene changes and audio levels; captions were turned off.',
    };
  }

  return {
    segments: [],
    hasSpeech: false,
    detectedLanguage: opts.language,
    notice:
      'Local faster-whisper is not installed in this environment yet, so automatic captions were skipped and moments were scored using audio energy, speech bursts, and scene changes. Run start.bat / start.sh on your computer to enable free offline speech-to-text, or type/edit captions in the Manual Editor.',
  };
}
