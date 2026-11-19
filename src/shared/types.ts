export type AspectRatio = '9:16' | '1:1' | '4:5' | '16:9';

export type LayoutMode = 'blur' | 'crop' | 'split' | 'solid';

export type ClipMode = 'auto' | 'manual' | 'mixed';

export type CaptionPresetId =
  | 'classic-yellow'
  | 'neon-green'
  | 'red-impact'
  | 'clean-minimal'
  | 'boxed-highlight'
  | 'karaoke-sweep';

export type CaptionPosition = 'bottom' | 'middle' | 'top';

export type ProjectStage =
  | 'created'
  | 'downloading'
  | 'probing'
  | 'transcribing'
  | 'analyzing'
  | 'ready'
  | 'rendering'
  | 'paused'
  | 'completed'
  | 'error';

export type ClipStatus =
  | 'draft'
  | 'queued'
  | 'rendering'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface SplitCropBox {
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  w: number; // normalized 0..1
  h: number; // normalized 0..1
}

export interface SplitConfig {
  top: SplitCropBox;
  bottom: SplitCropBox;
}

export interface CaptionStyleConfig {
  presetId: CaptionPresetId;
  enabled: boolean;
  fontFamily: string;
  fontSize: number; // base pt on 1080x1920 scale
  primaryColor: string;
  highlightColor: string;
  outlineColor: string;
  outlineWidth: number;
  boxColor: string;
  position: CaptionPosition;
  uppercase: boolean;
  wordsPerLine: number; // 1 to 4
  autoEmoji: boolean;
  maskProfanity: boolean;
  rtl: boolean;
}

export interface HookConfig {
  enabled: boolean;
  durationSec: number; // 3 to 5
  bgColor: string;
  textColor: string;
}

export interface AudioConfig {
  normalizeLoudness: boolean; // -14 LUFS
  cleanVoice: boolean; // highpass + gentle compressor
  trimSilences: boolean; // remove long pauses
}

export interface ClipStyleConfig {
  ratio: AspectRatio;
  layout: LayoutMode;
  solidBgColor: string;
  solidBgGradientEnd: string;
  split: SplitConfig;
  captions: CaptionStyleConfig;
  hook: HookConfig;
  audio: AudioConfig;
  showCredit: boolean;
  showProgressBar: boolean;
  progressBarColor: string;
  // Vyro Campaign Mode (optional; set only when a campaign preset is chosen)
  campaignId?: string;
  disclosureText?: string; // e.g. "#ad" — burned as a full-clip overlay in render
}

export interface TranscriptWord {
  id: string;
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

export interface ClipItem {
  id: string;
  projectId: string;
  orderIndex: number;
  isRunnerUp: boolean;
  sourceType: 'auto' | 'manual';
  title: string;
  hookText: string;
  description: string;
  hashtags: string[];
  startTime: number;
  endTime: number;
  score: number;
  reasons: string[];
  ratio: AspectRatio;
  status: ClipStatus;
  progress: number;
  errorMessage?: string | null;
  outputPath?: string | null;
  thumbnailPath?: string | null;
  fileSizeBytes?: number | null;
  styleOverride?: ClipStyleConfig | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  title: string;
  creatorName: string;
  sourceType: 'url' | 'upload' | 'sample';
  sourceUrl?: string | null;
  sourcePath?: string | null;
  sourceHash?: string | null;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  mode: ClipMode;
  requestedCount: number;
  targetClipLength: number; // 0 = auto length
  language: string;
  deepAnalysis: boolean;
  allRatios: boolean;
  stage: ProjectStage;
  stageMessage: string;
  progress: number;
  errorMessage?: string | null;
  manualCommandHint?: string | null;
  noticeMessage?: string | null;
  hasSpeech: boolean;
  transcript: TranscriptSegment[];
  waveformPeaks: number[];
  style: ClipStyleConfig;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  defaultStyle: ClipStyleConfig;
  defaultCreatorName: string;
  whisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';
  parallelRenders: number;
  cookiesBrowser: 'none' | 'chrome' | 'edge' | 'firefox';
  keepOutputsDays: number;
  outputFolder: string;
  useOllamaIfRunning: boolean;
}

export interface SystemHealth {
  ffmpeg: boolean;
  ffprobe: boolean;
  ytDlp: boolean;
  fasterWhisper: boolean;
  openCv: boolean;
  yamnet: boolean;
  ollama: boolean;
  hardwareEncoder: string;
  diskFreeGb: number;
  localIp: string;
  port: number;
}
