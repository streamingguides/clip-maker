import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AudioAnalysisResult } from './media.ts';
import { formatTime } from '../src/shared/styles.ts';
import type {
  AspectRatio,
  ClipItem,
  TranscriptSegment,
  TranscriptWord,
} from '../src/shared/types.ts';

interface KeywordsConfig {
  excitement: Record<string, string[]>;
  emojiMap: Record<string, string[]>;
  emojiChars: Record<string, string>;
  profanity: string[];
}

let cachedKeywords: KeywordsConfig | null = null;
export function loadKeywordsConfig(): KeywordsConfig {
  if (cachedKeywords) return cachedKeywords;
  const p = path.resolve(process.cwd(), 'config', 'keywords.json');
  try {
    cachedKeywords = JSON.parse(fs.readFileSync(p, 'utf8')) as KeywordsConfig;
    return cachedKeywords;
  } catch {
    return {
      excitement: { en: ['wait', 'insane', 'secret', 'amazing', 'never', 'best'] },
      emojiMap: {},
      emojiChars: {},
      profanity: [],
    };
  }
}

export function parseChatSpikes(chatFile: string | undefined, durationSec: number): number[] {
  if (!chatFile || !fs.existsSync(chatFile)) return [];
  const buckets = new Array<number>(Math.max(1, Math.ceil(durationSec / 5))).fill(0);
  try {
    const content = fs.readFileSync(chatFile, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const m = line.match(/"videoOffsetTimeMsec"\s*:\s*"?(\d+)"?/);
      if (m) {
        const sec = Number(m[1]) / 1000;
        const idx = Math.floor(sec / 5);
        if (idx >= 0 && idx < buckets.length) buckets[idx]++;
      }
    }
  } catch {
    return [];
  }
  const maxVal = Math.max(1, ...buckets);
  return buckets.map((v) => v / maxVal);
}

export function snapWindowToWords(
  start: number,
  end: number,
  segments: TranscriptSegment[],
  durationSec: number
): { start: number; end: number } {
  const allWords: TranscriptWord[] = [];
  for (const s of segments) {
    if (s.words.length > 0) allWords.push(...s.words);
    else {
      allWords.push({ id: s.id, word: s.text, start: s.start, end: s.end });
    }
  }
  if (allWords.length === 0) {
    return {
      start: Math.max(0, Math.round(start * 10) / 10),
      end: Math.min(durationSec, Math.round(end * 10) / 10),
    };
  }

  // Prefer sentence segment boundaries within 3.5s, otherwise nearest word boundary
  let snappedStart = start;
  const nearSegStart = segments.find((s) => Math.abs(s.start - start) <= 3.5);
  if (nearSegStart) {
    snappedStart = nearSegStart.start;
  } else {
    let bestWord = allWords[0];
    let bestDist = Infinity;
    for (const w of allWords) {
      const d = Math.abs(w.start - start);
      if (d < bestDist) {
        bestDist = d;
        bestWord = w;
      }
    }
    if (bestDist <= 4) snappedStart = bestWord.start;
  }

  let snappedEnd = end;
  const nearSegEnd = segments.find((s) => Math.abs(s.end - end) <= 3.5 && s.end > snappedStart + 4);
  if (nearSegEnd) {
    snappedEnd = nearSegEnd.end;
  } else {
    let bestWord = allWords[allWords.length - 1];
    let bestDist = Infinity;
    for (const w of allWords) {
      if (w.end <= snappedStart + 4) continue;
      const d = Math.abs(w.end - end);
      if (d < bestDist) {
        bestDist = d;
        bestWord = w;
      }
    }
    if (bestDist <= 4) snappedEnd = bestWord.end;
  }

  snappedStart = Math.max(0, Math.min(snappedStart, Math.max(0, durationSec - 4)));
  snappedEnd = Math.max(snappedStart + 4, Math.min(durationSec, snappedEnd));

  return {
    start: Math.round(snappedStart * 100) / 100,
    end: Math.round(snappedEnd * 100) / 100,
  };
}

function buildHookAndMeta(
  windowText: string,
  creatorName: string,
  startSec: number,
  reasons: string[],
  idx: number
): { title: string; hookText: string; description: string; hashtags: string[] } {
  const cleanText = windowText.replace(/\s+/g, ' ').trim();
  let title = '';
  let hookText = '';

  if (cleanText.length > 0) {
    const sentences = cleanText.split(/(?<=[.!?؟])\s+/);
    const first = sentences[0] || cleanText;
    title = first.slice(0, 52).trim();
    if (first.length > 52) title += '...';

    // Prefer an attention-grabbing sentence with ?, !, or number for the hook
    const punchy =
      sentences.find((s) => /[?!؟]|\d+/.test(s) && s.length >= 12) || first;
    hookText = punchy.slice(0, 58).trim();
    if (punchy.length > 58) hookText = hookText.slice(0, 55).trim() + '...';
  } else {
    title = `Highlight #${idx + 1} (${formatTime(startSec)})`;
    hookText = reasons[0] ? reasons[0].slice(0, 58) : `Must-watch moment at ${formatTime(startSec)}`;
  }

  const tags = ['#shorts', '#reels', '#clips', '#viral'];
  if (cleanText.toLowerCase().includes('urdu') || /[\u0600-\u06FF]/.test(cleanText)) {
    tags.push('#urdu');
  }

  const creditLine = creatorName ? `Source: ${creatorName}` : '';
  const description = [
    title,
    reasons.length > 0 ? `Why this moment stands out: ${reasons.join(', ')}.` : '',
    creditLine,
    tags.join(' '),
  ]
    .filter(Boolean)
    .join('\n\n');

  return { title, hookText, description, hashtags: tags };
}

async function tryOllamaPolish(
  title: string,
  hook: string,
  excerpt: string
): Promise<{ title: string; hookText: string } | null> {
  if (!excerpt.trim()) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'llama3.2',
        stream: false,
        prompt: `Write a short catchy title (max 50 chars) and hook headline (max 55 chars) for this video clip transcript. Reply ONLY as JSON {"title":"...","hook":"..."}.\nTranscript: ${excerpt.slice(0, 400)}`,
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    const m = data.response?.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { title?: string; hook?: string };
    return {
      title: (parsed.title || title).slice(0, 55),
      hookText: (parsed.hook || hook).slice(0, 60),
    };
  } catch {
    return null;
  }
}

export interface DetectMomentsOptions {
  projectId: string;
  durationSec: number;
  requestedCount: number;
  targetClipLength: number; // 0 = auto
  creatorName: string;
  ratio: AspectRatio;
  transcript: TranscriptSegment[];
  audioAnalysis: AudioAnalysisResult;
  chatSpikes?: number[];
  useOllama?: boolean;
  existingRanges?: Array<{ start: number; end: number }>;
}

export async function detectBestMoments(opts: DetectMomentsOptions): Promise<{
  clips: ClipItem[];
  runnerUps: ClipItem[];
  shortageNotice?: string;
}> {
  const {
    projectId,
    durationSec,
    requestedCount,
    targetClipLength,
    creatorName,
    ratio,
    transcript,
    audioAnalysis,
    chatSpikes = [],
    useOllama = false,
    existingRanges = [],
  } = opts;

  const keywordsCfg = loadKeywordsConfig();
  const allKeywords = Object.values(keywordsCfg.excitement).flat().map((k) => k.toLowerCase());

  const safeDur = Math.max(4, durationSec);
  const effectiveClipLen =
    targetClipLength > 0
      ? Math.min(targetClipLength, Math.max(4, Math.floor(safeDur * 0.85)))
      : Math.min(42, Math.max(8, Math.round(safeDur / Math.max(2, Math.min(8, requestedCount)))));

  const energy = audioAnalysis.energyHalfSec;
  const avgEnergy =
    energy.length > 0 ? energy.reduce((a, b) => a + b, 0) / energy.length : 0.3;

  const totalWords = transcript.reduce((sum, s) => sum + Math.max(1, s.words.length), 0);
  const avgSpeechRate = totalWords / Math.max(1, safeDur);

  // Step size balances speed on 4+ hour videos while still finding dense candidates
  const stepSec = safeDur > 3600 ? 8 : safeDur > 600 ? 4 : safeDur > 90 ? 2.5 : 1.5;

  interface Candidate {
    start: number;
    end: number;
    score: number;
    reasons: string[];
    text: string;
  }

  const candidates: Candidate[] = [];

  for (let t = 0; t <= Math.max(0, safeDur - Math.min(effectiveClipLen, safeDur)); t += stepSec) {
    const rawStart = t;
    const rawEnd = Math.min(safeDur, t + effectiveClipLen);
    if (rawEnd - rawStart < 3.5) continue;

    const snapped = snapWindowToWords(rawStart, rawEnd, transcript, safeDur);
    const wDur = snapped.end - snapped.start;
    if (wDur < 3.5) continue;

    let score = 45;
    const reasons: string[] = [];

    // 1. Audio energy spike
    if (energy.length > 0) {
      const i0 = Math.max(0, Math.floor(snapped.start * 2));
      const i1 = Math.min(energy.length, Math.ceil(snapped.end * 2));
      let winMax = 0;
      let winSum = 0;
      for (let i = i0; i < i1; i++) {
        winSum += energy[i];
        if (energy[i] > winMax) winMax = energy[i];
      }
      const winMean = winSum / Math.max(1, i1 - i0);
      if (winMax > avgEnergy * 1.45 && winMax > 0.45) {
        score += 18;
        reasons.push(`Loud reaction peak at ${formatTime(snapped.start + (i1 - i0) * 0.15)}`);
      } else if (winMean > avgEnergy * 1.15) {
        score += 10;
        reasons.push('High audio energy');
      }

      // Acoustic burst / laughter cadence (modulated peaks separated by short drops)
      let burstPeaks = 0;
      for (let i = i0 + 1; i < i1 - 1; i++) {
        if (energy[i] > avgEnergy * 1.35 && energy[i] > energy[i - 1] && energy[i] > energy[i + 1]) {
          burstPeaks++;
        }
      }
      if (burstPeaks >= 3) {
        score += 8;
        reasons.push('Dynamic voice / laughter cadence');
      }
    }

    // 2. Pause followed by burst
    const pauseJustBefore = audioAnalysis.silences.some(
      (sil) => Math.abs(sil.end - snapped.start) <= 1.2 && sil.end - sil.start >= 0.45
    );
    if (pauseJustBefore) {
      score += 7;
      reasons.push('Pause into strong start');
    }

    // 3. Scene changes bonus
    const scenesInWin = audioAnalysis.sceneChanges.filter(
      (sc) => sc >= snapped.start && sc <= snapped.end
    ).length;
    if (scenesInWin >= 2) {
      score += Math.min(10, scenesInWin * 2);
      reasons.push(`${scenesInWin} visual scene shifts`);
    }

    // 4. Live chat spikes
    if (chatSpikes.length > 0) {
      const b0 = Math.floor(snapped.start / 5);
      const b1 = Math.min(chatSpikes.length - 1, Math.floor(snapped.end / 5));
      let maxChat = 0;
      for (let b = b0; b <= b1; b++) {
        if (chatSpikes[b] > maxChat) maxChat = chatSpikes[b];
      }
      if (maxChat > 0.6) {
        score += 16;
        reasons.push('Chat replay spike');
      }
    }

    // 5. Transcript signals
    const segsInWin = transcript.filter(
      (s) => s.end >= snapped.start && s.start <= snapped.end
    );
    const text = segsInWin.map((s) => s.text).join(' ').trim();
    if (text) {
      const lower = text.toLowerCase();
      if (/[?؟]/.test(text)) {
        score += 9;
        reasons.push('Strong question hook');
      }
      if (/\d+/.test(text)) {
        score += 6;
        reasons.push('Contains specific numbers');
      }
      if (/!/.test(text)) {
        score += 5;
      }
      const matchedKw = allKeywords.find((kw) => lower.includes(kw));
      if (matchedKw) {
        score += 12;
        reasons.push(`High-interest phrase ("${matchedKw}")`);
      }
      const wordsInWin = segsInWin.reduce((acc, s) => acc + Math.max(1, s.words.length), 0);
      const winRate = wordsInWin / Math.max(1, wDur);
      if (avgSpeechRate > 0 && winRate > avgSpeechRate * 1.22) {
        score += 8;
        reasons.push('Fast-paced delivery');
      }
    }

    if (reasons.length === 0) {
      reasons.push('Balanced pacing & clean framing');
    }

    candidates.push({
      start: snapped.start,
      end: snapped.end,
      score: Math.min(99, Math.max(25, Math.round(score))),
      reasons: reasons.slice(0, 3),
      text,
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  // Enforce non-overlap and minimum gap (~20s on normal/long videos, adaptive on short test videos)
  const minGapSec = safeDur >= 150 ? 20 : safeDur >= 60 ? 6 : 2;
  const selected: Candidate[] = [];
  const runnerUpsRaw: Candidate[] = [];

  const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }, gap: number) =>
    !(a.end + gap <= b.start || b.end + gap <= a.start);

  for (const cand of candidates) {
    if (existingRanges.some((ex) => overlaps(cand, ex, 2))) continue;
    if (selected.some((sel) => overlaps(cand, sel, minGapSec))) continue;

    if (selected.length < requestedCount) {
      selected.push(cand);
    } else if (runnerUpsRaw.length < 5) {
      if (!runnerUpsRaw.some((ru) => overlaps(cand, ru, Math.min(minGapSec, 8)))) {
        runnerUpsRaw.push(cand);
      }
    } else {
      break;
    }
  }

  // If still fewer than requested and user asked for many, try tighter 2s gap pass for non-overlapping distinct segments
  if (selected.length < requestedCount) {
    for (const cand of candidates) {
      if (selected.length >= requestedCount) break;
      if (existingRanges.some((ex) => overlaps(cand, ex, 1))) continue;
      if (selected.some((sel) => overlaps(cand, sel, 1))) continue;
      selected.push(cand);
    }
  }

  const now = new Date().toISOString();
  const makeClipItem = async (
    c: Candidate,
    idx: number,
    isRunnerUp: boolean
  ): Promise<ClipItem> => {
    let meta = buildHookAndMeta(c.text, creatorName, c.start, c.reasons, idx);
    if (useOllama && !isRunnerUp && idx < 10) {
      const polished = await tryOllamaPolish(meta.title, meta.hookText, c.text);
      if (polished) {
        meta = { ...meta, ...polished };
      }
    }
    return {
      id: crypto.randomUUID(),
      projectId,
      orderIndex: idx,
      isRunnerUp,
      sourceType: 'auto',
      title: meta.title,
      hookText: meta.hookText,
      description: meta.description,
      hashtags: meta.hashtags,
      startTime: c.start,
      endTime: c.end,
      score: c.score,
      reasons: c.reasons,
      ratio,
      status: 'draft',
      progress: 0,
      createdAt: now,
      updatedAt: now,
    };
  };

  const clips = await Promise.all(selected.map((c, i) => makeClipItem(c, i, false)));
  const runnerUps = await Promise.all(runnerUpsRaw.map((c, i) => makeClipItem(c, i, true)));

  let shortageNotice: string | undefined;
  if (clips.length < requestedCount) {
    shortageNotice = `Only ${clips.length} strong non-overlapping moments found in this ${formatTime(safeDur)} video (you asked for ${requestedCount}).`;
  }

  return { clips, runnerUps, shortageNotice };
}
