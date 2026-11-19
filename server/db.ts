import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STYLE } from '../src/shared/styles.ts';
import type {
  AppSettings,
  ClipItem,
  ClipStyleConfig,
  ProjectRecord,
  TranscriptSegment,
} from '../src/shared/types.ts';

export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
export const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
export const CACHE_DIR = path.join(STORAGE_ROOT, 'cache');
export const OUTPUTS_DIR = path.join(STORAGE_ROOT, 'outputs');
export const TEMP_DIR = path.join(STORAGE_ROOT, 'temp');

for (const dir of [STORAGE_ROOT, UPLOADS_DIR, CACHE_DIR, OUTPUTS_DIR, TEMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DB_PATH = path.join(STORAGE_ROOT, 'clip_maker.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    creator_name TEXT NOT NULL DEFAULT 'Creator',
    source_type TEXT NOT NULL,
    source_url TEXT,
    source_path TEXT,
    source_hash TEXT,
    duration_sec REAL NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 1920,
    height INTEGER NOT NULL DEFAULT 1080,
    fps REAL NOT NULL DEFAULT 30,
    mode TEXT NOT NULL DEFAULT 'auto',
    requested_count INTEGER NOT NULL DEFAULT 5,
    target_clip_length INTEGER NOT NULL DEFAULT 30,
    language TEXT NOT NULL DEFAULT 'auto',
    deep_analysis INTEGER NOT NULL DEFAULT 0,
    all_ratios INTEGER NOT NULL DEFAULT 0,
    stage TEXT NOT NULL DEFAULT 'created',
    stage_message TEXT NOT NULL DEFAULT '',
    progress INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    manual_command_hint TEXT,
    notice_message TEXT,
    has_speech INTEGER NOT NULL DEFAULT 1,
    transcript_json TEXT NOT NULL DEFAULT '[]',
    waveform_json TEXT NOT NULL DEFAULT '[]',
    style_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clips (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    is_runner_up INTEGER NOT NULL DEFAULT 0,
    source_type TEXT NOT NULL DEFAULT 'auto',
    title TEXT NOT NULL,
    hook_text TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    hashtags_json TEXT NOT NULL DEFAULT '[]',
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    score INTEGER NOT NULL DEFAULT 75,
    reasons_json TEXT NOT NULL DEFAULT '[]',
    ratio TEXT NOT NULL DEFAULT '9:16',
    status TEXT NOT NULL DEFAULT 'draft',
    progress INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    output_path TEXT,
    thumbnail_path TEXT,
    file_size_bytes INTEGER,
    style_override_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS source_cache (
    cache_key TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    title TEXT NOT NULL,
    creator_name TEXT NOT NULL,
    duration_sec REAL NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    fps REAL NOT NULL,
    has_speech INTEGER NOT NULL DEFAULT 1,
    transcript_json TEXT NOT NULL DEFAULT '[]',
    waveform_json TEXT NOT NULL DEFAULT '[]',
    chat_spikes_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json_data TEXT NOT NULL
  );
`);

// Crash recovery: reset any in-progress rendering clips back to queued on startup
db.exec(`
  UPDATE clips SET status = 'queued', progress = 0 WHERE status = 'rendering';
`);

export const DEFAULT_SETTINGS: AppSettings = {
  defaultStyle: DEFAULT_STYLE,
  defaultCreatorName: '',
  whisperModel: 'small',
  parallelRenders: 2,
  cookiesBrowser: 'none',
  keepOutputsDays: 14,
  outputFolder: OUTPUTS_DIR,
  useOllamaIfRunning: false,
};

export function getSettings(): AppSettings {
  const row = db
    .prepare('SELECT json_data FROM settings WHERE id = 1')
    .get() as { json_data: string } | undefined;
  if (!row) {
    db.prepare('INSERT INTO settings (id, json_data) VALUES (1, ?)').run(
      JSON.stringify(DEFAULT_SETTINGS)
    );
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(row.json_data) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      defaultStyle: {
        ...DEFAULT_STYLE,
        ...(parsed.defaultStyle ?? {}),
        captions: {
          ...DEFAULT_STYLE.captions,
          ...(parsed.defaultStyle?.captions ?? {}),
        },
        hook: {
          ...DEFAULT_STYLE.hook,
          ...(parsed.defaultStyle?.hook ?? {}),
        },
        audio: {
          ...DEFAULT_STYLE.audio,
          ...(parsed.defaultStyle?.audio ?? {}),
        },
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: AppSettings): AppSettings {
  db.prepare(
    'INSERT INTO settings (id, json_data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data'
  ).run(JSON.stringify(next));
  return next;
}

function mapProjectRow(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    creatorName: String(row.creator_name ?? 'Creator'),
    sourceType: row.source_type as ProjectRecord['sourceType'],
    sourceUrl: (row.source_url as string | null) ?? null,
    sourcePath: (row.source_path as string | null) ?? null,
    sourceHash: (row.source_hash as string | null) ?? null,
    durationSec: Number(row.duration_sec ?? 0),
    width: Number(row.width ?? 1920),
    height: Number(row.height ?? 1080),
    fps: Number(row.fps ?? 30),
    mode: row.mode as ProjectRecord['mode'],
    requestedCount: Number(row.requested_count ?? 5),
    targetClipLength: Number(row.target_clip_length ?? 30),
    language: String(row.language ?? 'auto'),
    deepAnalysis: Boolean(row.deep_analysis),
    allRatios: Boolean(row.all_ratios),
    stage: row.stage as ProjectRecord['stage'],
    stageMessage: String(row.stage_message ?? ''),
    progress: Number(row.progress ?? 0),
    errorMessage: (row.error_message as string | null) ?? null,
    manualCommandHint: (row.manual_command_hint as string | null) ?? null,
    noticeMessage: (row.notice_message as string | null) ?? null,
    hasSpeech: Boolean(row.has_speech),
    transcript: JSON.parse(String(row.transcript_json || '[]')) as TranscriptSegment[],
    waveformPeaks: JSON.parse(String(row.waveform_json || '[]')) as number[],
    style: JSON.parse(String(row.style_json)) as ClipStyleConfig,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapClipRow(row: Record<string, unknown>): ClipItem {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    orderIndex: Number(row.order_index ?? 0),
    isRunnerUp: Boolean(row.is_runner_up),
    sourceType: (row.source_type as 'auto' | 'manual') ?? 'auto',
    title: String(row.title),
    hookText: String(row.hook_text ?? ''),
    description: String(row.description ?? ''),
    hashtags: JSON.parse(String(row.hashtags_json || '[]')) as string[],
    startTime: Number(row.start_time),
    endTime: Number(row.end_time),
    score: Number(row.score ?? 0),
    reasons: JSON.parse(String(row.reasons_json || '[]')) as string[],
    ratio: (row.ratio as ClipItem['ratio']) ?? '9:16',
    status: (row.status as ClipItem['status']) ?? 'draft',
    progress: Number(row.progress ?? 0),
    errorMessage: (row.error_message as string | null) ?? null,
    outputPath: (row.output_path as string | null) ?? null,
    thumbnailPath: (row.thumbnail_path as string | null) ?? null,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    styleOverride: row.style_override_json
      ? (JSON.parse(String(row.style_override_json)) as ClipStyleConfig)
      : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listProjects(): Array<ProjectRecord & { clipCount: number; completedCount: number }> {
  const rows = db
    .prepare(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM clips c WHERE c.project_id = p.id AND c.is_runner_up = 0) AS clip_count,
        (SELECT COUNT(*) FROM clips c WHERE c.project_id = p.id AND c.is_runner_up = 0 AND c.status = 'completed') AS completed_count
       FROM projects p ORDER BY p.created_at DESC LIMIT 40`
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    ...mapProjectRow(r),
    clipCount: Number(r.clip_count ?? 0),
    completedCount: Number(r.completed_count ?? 0),
  }));
}

export function getProject(id: string): ProjectRecord | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapProjectRow(row) : null;
}

export function createProject(project: ProjectRecord): ProjectRecord {
  db.prepare(
    `INSERT INTO projects (
      id, title, creator_name, source_type, source_url, source_path, source_hash,
      duration_sec, width, height, fps, mode, requested_count, target_clip_length,
      language, deep_analysis, all_ratios, stage, stage_message, progress,
      error_message, manual_command_hint, notice_message, has_speech,
      transcript_json, waveform_json, style_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    project.id,
    project.title,
    project.creatorName,
    project.sourceType,
    project.sourceUrl ?? null,
    project.sourcePath ?? null,
    project.sourceHash ?? null,
    project.durationSec,
    project.width,
    project.height,
    project.fps,
    project.mode,
    project.requestedCount,
    project.targetClipLength,
    project.language,
    project.deepAnalysis ? 1 : 0,
    project.allRatios ? 1 : 0,
    project.stage,
    project.stageMessage,
    project.progress,
    project.errorMessage ?? null,
    project.manualCommandHint ?? null,
    project.noticeMessage ?? null,
    project.hasSpeech ? 1 : 0,
    JSON.stringify(project.transcript),
    JSON.stringify(project.waveformPeaks),
    JSON.stringify(project.style),
    project.createdAt,
    project.updatedAt
  );
  return project;
}

export function updateProject(
  id: string,
  patch: Partial<ProjectRecord>
): ProjectRecord | null {
  const existing = getProject(id);
  if (!existing) return null;
  const merged: ProjectRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE projects SET
      title = ?, creator_name = ?, source_path = ?, source_hash = ?,
      duration_sec = ?, width = ?, height = ?, fps = ?, mode = ?,
      requested_count = ?, target_clip_length = ?, language = ?,
      deep_analysis = ?, all_ratios = ?, stage = ?, stage_message = ?,
      progress = ?, error_message = ?, manual_command_hint = ?,
      notice_message = ?, has_speech = ?, transcript_json = ?,
      waveform_json = ?, style_json = ?, updated_at = ?
    WHERE id = ?`
  ).run(
    merged.title,
    merged.creatorName,
    merged.sourcePath ?? null,
    merged.sourceHash ?? null,
    merged.durationSec,
    merged.width,
    merged.height,
    merged.fps,
    merged.mode,
    merged.requestedCount,
    merged.targetClipLength,
    merged.language,
    merged.deepAnalysis ? 1 : 0,
    merged.allRatios ? 1 : 0,
    merged.stage,
    merged.stageMessage,
    merged.progress,
    merged.errorMessage ?? null,
    merged.manualCommandHint ?? null,
    merged.noticeMessage ?? null,
    merged.hasSpeech ? 1 : 0,
    JSON.stringify(merged.transcript),
    JSON.stringify(merged.waveformPeaks),
    JSON.stringify(merged.style),
    merged.updatedAt,
    id
  );
  return merged;
}

export function deleteProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function getClipsForProject(projectId: string): ClipItem[] {
  const rows = db
    .prepare(
      'SELECT * FROM clips WHERE project_id = ? ORDER BY is_runner_up ASC, order_index ASC, created_at ASC'
    )
    .all(projectId) as Array<Record<string, unknown>>;
  return rows.map(mapClipRow);
}

export function getClip(clipId: string): ClipItem | null {
  const row = db.prepare('SELECT * FROM clips WHERE id = ?').get(clipId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapClipRow(row) : null;
}

export function insertClip(clip: ClipItem): ClipItem {
  db.prepare(
    `INSERT INTO clips (
      id, project_id, order_index, is_runner_up, source_type, title, hook_text,
      description, hashtags_json, start_time, end_time, score, reasons_json,
      ratio, status, progress, error_message, output_path, thumbnail_path,
      file_size_bytes, style_override_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    clip.id,
    clip.projectId,
    clip.orderIndex,
    clip.isRunnerUp ? 1 : 0,
    clip.sourceType,
    clip.title,
    clip.hookText,
    clip.description,
    JSON.stringify(clip.hashtags),
    clip.startTime,
    clip.endTime,
    clip.score,
    JSON.stringify(clip.reasons),
    clip.ratio,
    clip.status,
    clip.progress,
    clip.errorMessage ?? null,
    clip.outputPath ?? null,
    clip.thumbnailPath ?? null,
    clip.fileSizeBytes ?? null,
    clip.styleOverride ? JSON.stringify(clip.styleOverride) : null,
    clip.createdAt,
    clip.updatedAt
  );
  return clip;
}

export function updateClip(
  clipId: string,
  patch: Partial<ClipItem>
): ClipItem | null {
  const existing = getClip(clipId);
  if (!existing) return null;
  const merged: ClipItem = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  db.prepare(
    `UPDATE clips SET
      order_index = ?, is_runner_up = ?, title = ?, hook_text = ?,
      description = ?, hashtags_json = ?, start_time = ?, end_time = ?,
      score = ?, reasons_json = ?, ratio = ?, status = ?, progress = ?,
      error_message = ?, output_path = ?, thumbnail_path = ?,
      file_size_bytes = ?, style_override_json = ?, updated_at = ?
    WHERE id = ?`
  ).run(
    merged.orderIndex,
    merged.isRunnerUp ? 1 : 0,
    merged.title,
    merged.hookText,
    merged.description,
    JSON.stringify(merged.hashtags),
    merged.startTime,
    merged.endTime,
    merged.score,
    JSON.stringify(merged.reasons),
    merged.ratio,
    merged.status,
    merged.progress,
    merged.errorMessage ?? null,
    merged.outputPath ?? null,
    merged.thumbnailPath ?? null,
    merged.fileSizeBytes ?? null,
    merged.styleOverride ? JSON.stringify(merged.styleOverride) : null,
    merged.updatedAt,
    clipId
  );
  return merged;
}

export function deleteClip(clipId: string): void {
  db.prepare('DELETE FROM clips WHERE id = ?').run(clipId);
}

export function deleteAutoClipsForProject(projectId: string): void {
  db.prepare("DELETE FROM clips WHERE project_id = ? AND source_type = 'auto'").run(
    projectId
  );
}

export function getSourceCache(cacheKey: string) {
  const row = db
    .prepare('SELECT * FROM source_cache WHERE cache_key = ?')
    .get(cacheKey) as Record<string, unknown> | undefined;
  if (!row) return null;
  if (!fs.existsSync(String(row.source_path))) return null;
  return {
    cacheKey: String(row.cache_key),
    sourcePath: String(row.source_path),
    title: String(row.title),
    creatorName: String(row.creator_name),
    durationSec: Number(row.duration_sec),
    width: Number(row.width),
    height: Number(row.height),
    fps: Number(row.fps),
    hasSpeech: Boolean(row.has_speech),
    transcript: JSON.parse(String(row.transcript_json || '[]')) as TranscriptSegment[],
    waveformPeaks: JSON.parse(String(row.waveform_json || '[]')) as number[],
    chatSpikes: JSON.parse(String(row.chat_spikes_json || '[]')) as number[],
  };
}

export function setSourceCache(entry: {
  cacheKey: string;
  sourcePath: string;
  title: string;
  creatorName: string;
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  hasSpeech: boolean;
  transcript: TranscriptSegment[];
  waveformPeaks: number[];
  chatSpikes: number[];
}): void {
  db.prepare(
    `INSERT INTO source_cache (
      cache_key, source_path, title, creator_name, duration_sec, width, height, fps,
      has_speech, transcript_json, waveform_json, chat_spikes_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      source_path = excluded.source_path,
      title = excluded.title,
      creator_name = excluded.creator_name,
      duration_sec = excluded.duration_sec,
      width = excluded.width,
      height = excluded.height,
      fps = excluded.fps,
      has_speech = excluded.has_speech,
      transcript_json = excluded.transcript_json,
      waveform_json = excluded.waveform_json,
      chat_spikes_json = excluded.chat_spikes_json`
  ).run(
    entry.cacheKey,
    entry.sourcePath,
    entry.title,
    entry.creatorName,
    entry.durationSec,
    entry.width,
    entry.height,
    entry.fps,
    entry.hasSpeech ? 1 : 0,
    JSON.stringify(entry.transcript),
    JSON.stringify(entry.waveformPeaks),
    JSON.stringify(entry.chatSpikes),
    new Date().toISOString()
  );
}

export function cleanupOldOutputs(days: number): number {
  const cutoffMs = Date.now() - Math.max(1, days) * 86400 * 1000;
  let removed = 0;
  if (!fs.existsSync(TEMP_DIR)) return 0;
  for (const file of fs.readdirSync(TEMP_DIR)) {
    const full = path.join(TEMP_DIR, file);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoffMs) {
        fs.rmSync(full, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // ignore
    }
  }
  return removed;
}
