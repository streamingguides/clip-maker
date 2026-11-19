import type {
  AspectRatio,
  CaptionPresetId,
  CaptionStyleConfig,
  ClipStyleConfig,
} from './types.ts';

export interface CaptionPresetMeta {
  id: CaptionPresetId;
  name: string;
  hint: string;
  config: Partial<CaptionStyleConfig>;
}

export const CAPTION_PRESETS: CaptionPresetMeta[] = [
  {
    id: 'classic-yellow',
    name: 'Classic Yellow',
    hint: 'Bold white text with bright yellow active word',
    config: {
      presetId: 'classic-yellow',
      fontFamily: 'Montserrat',
      fontSize: 64,
      primaryColor: '#FFFFFF',
      highlightColor: '#FACC15',
      outlineColor: '#000000',
      outlineWidth: 5,
      boxColor: 'rgba(0,0,0,0)',
      uppercase: true,
      wordsPerLine: 3,
    },
  },
  {
    id: 'neon-green',
    name: 'Neon Green',
    hint: 'High-contrast white with vivid green pop',
    config: {
      presetId: 'neon-green',
      fontFamily: 'Anton',
      fontSize: 68,
      primaryColor: '#FFFFFF',
      highlightColor: '#22C55E',
      outlineColor: '#090D16',
      outlineWidth: 5,
      boxColor: 'rgba(0,0,0,0)',
      uppercase: true,
      wordsPerLine: 2,
    },
  },
  {
    id: 'red-impact',
    name: 'Red Impact',
    hint: 'Punchy red emphasis for dramatic hooks',
    config: {
      presetId: 'red-impact',
      fontFamily: 'Anton',
      fontSize: 70,
      primaryColor: '#FFFFFF',
      highlightColor: '#EF4444',
      outlineColor: '#000000',
      outlineWidth: 6,
      boxColor: 'rgba(0,0,0,0)',
      uppercase: true,
      wordsPerLine: 2,
    },
  },
  {
    id: 'clean-minimal',
    name: 'Clean Minimal',
    hint: 'Crisp editorial sans with subtle cyan accent',
    config: {
      presetId: 'clean-minimal',
      fontFamily: 'Noto Sans',
      fontSize: 54,
      primaryColor: '#F8FAFC',
      highlightColor: '#38BDF8',
      outlineColor: '#0F172A',
      outlineWidth: 3,
      boxColor: 'rgba(0,0,0,0)',
      uppercase: false,
      wordsPerLine: 4,
    },
  },
  {
    id: 'boxed-highlight',
    name: 'Boxed Highlight',
    hint: 'Solid dark backing box for busy backgrounds',
    config: {
      presetId: 'boxed-highlight',
      fontFamily: 'Montserrat',
      fontSize: 58,
      primaryColor: '#FFFFFF',
      highlightColor: '#FDE047',
      outlineColor: '#000000',
      outlineWidth: 2,
      boxColor: 'rgba(15,23,42,0.82)',
      uppercase: false,
      wordsPerLine: 3,
    },
  },
  {
    id: 'karaoke-sweep',
    name: 'Karaoke Sweep',
    hint: 'Smooth left-to-right word fill sweep',
    config: {
      presetId: 'karaoke-sweep',
      fontFamily: 'Montserrat',
      fontSize: 62,
      primaryColor: '#E2E8F0',
      highlightColor: '#F59E0B',
      outlineColor: '#0F172A',
      outlineWidth: 4,
      boxColor: 'rgba(0,0,0,0)',
      uppercase: true,
      wordsPerLine: 3,
    },
  },
];

export const DEFAULT_STYLE: ClipStyleConfig = {
  ratio: '9:16',
  layout: 'blur',
  solidBgColor: '#0F172A',
  solidBgGradientEnd: '#1E293B',
  split: {
    top: { x: 0.05, y: 0.05, w: 0.9, h: 0.55 },
    bottom: { x: 0.25, y: 0.55, w: 0.5, h: 0.4 },
  },
  captions: {
    presetId: 'classic-yellow',
    enabled: true,
    fontFamily: 'Montserrat',
    fontSize: 64,
    primaryColor: '#FFFFFF',
    highlightColor: '#FACC15',
    outlineColor: '#000000',
    outlineWidth: 5,
    boxColor: 'rgba(0,0,0,0)',
    position: 'bottom',
    uppercase: true,
    wordsPerLine: 3,
    autoEmoji: true,
    maskProfanity: false,
    rtl: false,
  },
  hook: {
    enabled: true,
    durationSec: 4,
    bgColor: '#0F172A',
    textColor: '#FFFFFF',
  },
  audio: {
    normalizeLoudness: true,
    cleanVoice: true,
    trimSilences: false,
  },
  showCredit: true,
  showProgressBar: true,
  progressBarColor: '#FACC15',
};

export function applyPresetToStyle(
  style: ClipStyleConfig,
  presetId: CaptionPresetId
): ClipStyleConfig {
  const preset = CAPTION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return style;
  return {
    ...style,
    captions: {
      ...style.captions,
      ...preset.config,
      presetId,
    },
  };
}

export function getDimensionsForRatio(ratio: AspectRatio): {
  width: number;
  height: number;
} {
  switch (ratio) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '1:1':
      return { width: 1080, height: 1080 };
    case '4:5':
      return { width: 1080, height: 1350 };
    case '16:9':
      return { width: 1920, height: 1080 };
  }
}

export function formatTime(seconds: number, includeHours = false): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0 || includeHours) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }
  return `${pad(mins)}:${pad(secs)}`;
}

export function formatTimeShortFile(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}m${String(secs).padStart(2, '0')}s`;
}

export function parseTimestamp(input: string): number | null {
  const clean = input.trim();
  if (!clean) return null;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    return parseFloat(clean);
  }
  const parts = clean.split(':').map((p) => Number(p.trim()));
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return null;
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

export function parseTimestampList(
  raw: string,
  maxDuration: number
): Array<{ start: number; end: number; label?: string }> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const ranges: Array<{ start: number; end: number; label?: string }> = [];
  for (const line of lines) {
    const match = line.match(
      /^(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)\s*[-–to]+\s*(\d+(?::\d{1,2}){0,2}(?:\.\d+)?)(?:\s+(.*))?$/i
    );
    if (!match) continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    if (start === null || end === null) continue;
    const clampedStart = Math.max(0, Math.min(start, maxDuration));
    const clampedEnd = Math.max(clampedStart + 2, Math.min(end, maxDuration));
    if (clampedEnd > clampedStart) {
      ranges.push({
        start: clampedStart,
        end: clampedEnd,
        label: match[3]?.trim() || undefined,
      });
    }
  }
  return ranges;
}

export function isRtlLanguage(lang: string): boolean {
  const lower = (lang || '').toLowerCase();
  return (
    lower === 'ur' ||
    lower === 'ar' ||
    lower === 'ur-en' ||
    lower.includes('urdu') ||
    lower.includes('arabic')
  );
}
