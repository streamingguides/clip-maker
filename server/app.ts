import * as archiverPkg from 'archiver';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import path from 'node:path';
import {
  cleanupOldOutputs,
  createProject,
  deleteClip,
  deleteProject,
  getClip,
  getClipsForProject,
  getProject,
  getSettings,
  insertClip,
  listProjects,
  saveSettings,
  UPLOADS_DIR,
  updateClip,
  updateProject,
} from './db.ts';
import { getSystemHealth, validateMediaUrl } from './media.ts';
import { snapWindowToWords } from './moments.ts';
import {
  applyCampaignMeta,
  buildBatchPostCaptions,
  getCampaign,
  isCampaignMomentUsed,
  loadCampaigns,
  recordCampaignMoments,
} from './campaigns.ts';
import {
  cancelProjectQueue,
  enqueueProjectRender,
  enqueueSingleClipRerender,
  findMoreMomentsForProject,
  pauseProjectQueue,
  processProjectAnalysis,
  resumePendingJobsOnStartup,
  resumeProjectQueue,
  subscribeProjectEvents,
} from './queue.ts';
import { DEFAULT_STYLE, formatTimeShortFile, parseTimestampList } from '../src/shared/styles.ts';
import type {
  AppSettings,
  AspectRatio,
  ClipItem,
  ClipMode,
  ClipStyleConfig,
  ProjectRecord,
  TranscriptSegment,
} from '../src/shared/types.ts';

function streamVideoWithRange(req: Request, res: Response, filePath: string, mime = 'video/mp4'): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Video file not found' });
    return;
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (Number.isNaN(start) || start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mime,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

export function createApiApp(port: number) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.mp4';
      const safeBase = file.originalname
        .replace(ext, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 40);
      cb(null, `${Date.now()}_${safeBase}${ext}`);
    },
  });

  const upload = multer({
    storage,
    fileFilter: (_req, file, cb) => {
      if (/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.originalname)) {
        cb(null, true);
      } else {
        cb(new Error('Unsupported video format. Please upload mp4, mov, mkv, webm, or avi.'));
      }
    },
  });

  // Periodic cleanup & resume
  const settings = getSettings();
  cleanupOldOutputs(settings.keepOutputsDays);
  resumePendingJobsOnStartup();

  app.get('/api/health', async (_req, res) => {
    const health = await getSystemHealth(port);
    res.json(health);
  });

  // Vyro Campaign Mode presets (config/campaigns.json)
  app.get('/api/campaigns', (_req, res) => {
    res.json(loadCampaigns());
  });

  app.get('/api/settings', (_req, res) => {
    res.json(getSettings());
  });

  app.put('/api/settings', (req, res) => {
    const current = getSettings();
    const next: AppSettings = {
      ...current,
      ...(req.body as Partial<AppSettings>),
      parallelRenders: Math.max(1, Math.min(4, Number(req.body?.parallelRenders ?? current.parallelRenders))),
      keepOutputsDays: Math.max(1, Math.min(365, Number(req.body?.keepOutputsDays ?? current.keepOutputsDays))),
    };
    res.json(saveSettings(next));
  });

  app.get('/api/projects', (_req, res) => {
    res.json(listProjects());
  });

  app.get('/api/projects/:id', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const clips = getClipsForProject(project.id);
    res.json({ project, clips });
  });

  app.delete('/api/projects/:id', (req, res) => {
    deleteProject(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/projects/:id/events', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    subscribeProjectEvents(req.params.id, res);
  });

  function buildNewProject(opts: {
    title: string;
    sourceType: ProjectRecord['sourceType'];
    sourceUrl?: string;
    sourcePath?: string;
    body: Record<string, unknown>;
  }): ProjectRecord {
    const currentSettings = getSettings();
    const now = new Date().toISOString();
    let style: ClipStyleConfig = currentSettings.defaultStyle || DEFAULT_STYLE;
    if (opts.body.style) {
      const parsedStyle =
        typeof opts.body.style === 'string'
          ? (JSON.parse(opts.body.style) as ClipStyleConfig)
          : (opts.body.style as ClipStyleConfig);
      style = parsedStyle;
    }

    const mode = (['auto', 'manual', 'mixed'].includes(String(opts.body.mode))
      ? opts.body.mode
      : 'auto') as ClipMode;
    const requestedCount = Math.max(1, Math.min(100, Number(opts.body.requestedCount ?? 5)));
    const targetClipLength = Math.max(0, Math.min(180, Number(opts.body.targetClipLength ?? 30)));

    // Vyro Campaign Mode: a chosen preset (config/campaigns.json) pins the
    // ratio, clamps clip length into the campaign range, and stamps the
    // disclosure + campaign id into the style so every rendered clip carries
    // them. No campaign chosen = behaviour is exactly as before.
    const campaign = getCampaign(
      typeof opts.body.campaignId === 'string' ? opts.body.campaignId : undefined
    );
    let finalTargetClipLength = targetClipLength;
    if (campaign) {
      style = {
        ...style,
        ratio: campaign.defaultRatio as AspectRatio,
        campaignId: campaign.id,
        disclosureText: campaign.disclosureText,
      };
      finalTargetClipLength =
        targetClipLength === 0
          ? campaign.clipLength.defaultSec
          : Math.max(
              campaign.clipLength.minSec,
              Math.min(campaign.clipLength.maxSec, targetClipLength)
            );
    }

    return createProject({
      id: crypto.randomUUID(),
      title: opts.title,
      creatorName: String(opts.body.creatorName ?? currentSettings.defaultCreatorName ?? 'Creator'),
      sourceType: opts.sourceType,
      sourceUrl: opts.sourceUrl ?? null,
      sourcePath: opts.sourcePath ?? null,
      sourceHash: null,
      durationSec: 0,
      width: 1920,
      height: 1080,
      fps: 30,
      mode,
      requestedCount,
      targetClipLength: finalTargetClipLength,
      language: String(opts.body.language ?? 'auto'),
      deepAnalysis: Boolean(opts.body.deepAnalysis === true || opts.body.deepAnalysis === 'true'),
      allRatios: Boolean(opts.body.allRatios === true || opts.body.allRatios === 'true'),
      stage: 'created',
      stageMessage: 'Starting project...',
      progress: 0,
      hasSpeech: true,
      transcript: [],
      waveformPeaks: [],
      style,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Create project from local uploaded file (prioritized if both upload and URL are given)
  app.post('/api/projects/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Please select a video file to upload.' });
    }
    if (req.body.permissionConfirmed !== 'true' && req.body.permissionConfirmed !== true) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: 'Please confirm you own or have permission to clip this video.' });
    }
    const cleanTitle = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const project = buildNewProject({
      title: cleanTitle || 'Uploaded Video',
      sourceType: 'upload',
      sourcePath: req.file.path,
      body: req.body as Record<string, unknown>,
    });
    void processProjectAnalysis(project.id);
    res.json({ project });
  });

  // Create project from URL
  app.post('/api/projects/url', (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (!body.permissionConfirmed) {
      return res.status(400).json({ error: 'Please confirm you own or have permission to clip this video.' });
    }
    const check = validateMediaUrl(String(body.url ?? ''));
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    const project = buildNewProject({
      title: 'Online Video',
      sourceType: 'url',
      sourceUrl: check.url,
      body,
    });
    void processProjectAnalysis(project.id);
    res.json({ project });
  });

  // Built-in local sample video for instant 1-click testing
  app.post('/api/projects/sample', (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (!body.permissionConfirmed) {
      return res.status(400).json({ error: 'Please confirm permission checkbox first.' });
    }
    const project = buildNewProject({
      title: 'Clip Maker Demo Video',
      sourceType: 'sample',
      body,
    });
    void processProjectAnalysis(project.id);
    res.json({ project });
  });

  // Update project style or transcript
  app.put('/api/projects/:id/style', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const updated = updateProject(project.id, {
      style: req.body.style as ClipStyleConfig,
      creatorName: req.body.creatorName != null ? String(req.body.creatorName) : project.creatorName,
    });
    res.json({ project: updated });
  });

  app.put('/api/projects/:id/transcript', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const transcript = req.body.transcript as TranscriptSegment[];
    const updated = updateProject(project.id, {
      transcript,
      hasSpeech: transcript.length > 0,
    });
    res.json({ project: updated });
  });

  // Add manual clip(s) — single range or pasted timestamp list
  app.post('/api/projects/:id/clips', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const existing = getClipsForProject(project.id).filter((c) => !c.isRunnerUp);
    if (existing.length >= 100) {
      return res.status(400).json({ error: 'Maximum of 100 clips per project reached.' });
    }

    const body = req.body as {
      startTime?: number;
      endTime?: number;
      title?: string;
      hookText?: string;
      pastedList?: string;
      snapToWords?: boolean;
    };

    const rangesToAdd: Array<{ start: number; end: number; title?: string }> = [];
    if (body.pastedList) {
      const parsed = parseTimestampList(body.pastedList, project.durationSec || 36000);
      for (const p of parsed) {
        rangesToAdd.push({ start: p.start, end: p.end, title: p.label });
      }
    } else if (body.startTime != null && body.endTime != null) {
      rangesToAdd.push({
        start: Number(body.startTime),
        end: Number(body.endTime),
        title: body.title,
      });
    }

    if (rangesToAdd.length === 0) {
      return res.status(400).json({ error: 'No valid time range found.' });
    }

    const created: ClipItem[] = [];
    let order = existing.length;
    const now = new Date().toISOString();

    // Vyro Campaign Mode: skip moments already clipped for this campaign and
    // stamp the campaign post package (hashtags + #ad-first caption) on clips.
    const campaign = getCampaign(project.style.campaignId);
    const campaignSourceKey =
      project.sourceHash ?? project.sourceUrl ?? project.id;

    for (const r of rangesToAdd) {
      if (order >= 100) break;
      const clampedStart = Math.max(0, Math.min(r.start, Math.max(0, project.durationSec - 2)));
      const clampedEnd = Math.max(clampedStart + 2, Math.min(r.end, project.durationSec || r.end));
      const finalRange =
        body.snapToWords !== false && project.transcript.length > 0
          ? snapWindowToWords(clampedStart, clampedEnd, project.transcript, project.durationSec)
          : { start: clampedStart, end: clampedEnd };

      if (
        campaign &&
        isCampaignMomentUsed(
          campaign.id,
          campaignSourceKey,
          finalRange.start,
          finalRange.end
        )
      ) {
        continue; // Already clipped for this campaign — duplicate protection.
      }

      const segText = project.transcript
        .filter((s) => s.end >= finalRange.start && s.start <= finalRange.end)
        .map((s) => s.text)
        .join(' ')
        .trim();

      const title =
        r.title ||
        (segText ? segText.slice(0, 48) + (segText.length > 48 ? '...' : '') : `Clip #${order + 1}`);
      const hookText = body.hookText || title.slice(0, 58);

      const clip: ClipItem = {
        id: crypto.randomUUID(),
        projectId: project.id,
        orderIndex: order++,
        isRunnerUp: false,
        sourceType: 'manual',
        title,
        hookText,
        description: `${title}\n\n${project.creatorName ? `Source: ${project.creatorName}` : ''}`.trim(),
        hashtags: ['#shorts', '#reels', '#clips'],
        startTime: finalRange.start,
        endTime: finalRange.end,
        score: 100,
        reasons: ['Picked manually'],
        ratio: project.style.ratio,
        status: 'draft',
        progress: 0,
        createdAt: now,
        updatedAt: now,
      };
      if (campaign) {
        applyCampaignMeta(campaign, clip);
        recordCampaignMoments(campaign.id, campaignSourceKey, [
          { start: clip.startTime, end: clip.endTime },
        ]);
      }
      insertClip(clip);
      created.push(clip);
    }

    res.json({ clips: created });
  });

  app.put('/api/projects/:id/clips/reorder', (req, res) => {
    const orderedIds = (req.body.orderedIds as string[]) || [];
    orderedIds.forEach((id, idx) => {
      updateClip(id, { orderIndex: idx });
    });
    res.json({ clips: getClipsForProject(req.params.id) });
  });

  app.put('/api/clips/:clipId', (req, res) => {
    const clip = getClip(req.params.clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    const updated = updateClip(clip.id, req.body as Partial<ClipItem>);
    res.json({ clip: updated });
  });

  app.post('/api/clips/:clipId/duplicate', (req, res) => {
    const clip = getClip(req.params.clipId);
    if (!clip) return res.status(404).json({ error: 'Clip not found' });
    const siblings = getClipsForProject(clip.projectId).filter((c) => !c.isRunnerUp);
    if (siblings.length >= 100) {
      return res.status(400).json({ error: 'Maximum of 100 clips reached.' });
    }
    const now = new Date().toISOString();
    const copy: ClipItem = {
      ...clip,
      id: crypto.randomUUID(),
      orderIndex: siblings.length,
      isRunnerUp: false,
      title: `${clip.title} (Copy)`,
      status: 'draft',
      progress: 0,
      outputPath: null,
      thumbnailPath: null,
      fileSizeBytes: null,
      createdAt: now,
      updatedAt: now,
    };
    insertClip(copy);
    res.json({ clip: copy });
  });

  // Swap runner-up moment into primary clip list
  app.post('/api/clips/:clipId/promote', (req, res) => {
    const runnerUp = getClip(req.params.clipId);
    if (!runnerUp) return res.status(404).json({ error: 'Clip not found' });
    const siblings = getClipsForProject(runnerUp.projectId).filter((c) => !c.isRunnerUp);
    const updated = updateClip(runnerUp.id, {
      isRunnerUp: false,
      orderIndex: siblings.length,
    });
    res.json({ clip: updated });
  });

  app.delete('/api/clips/:clipId', (req, res) => {
    const clip = getClip(req.params.clipId);
    if (clip?.outputPath && fs.existsSync(clip.outputPath)) {
      try { fs.unlinkSync(clip.outputPath); } catch { /* ignore */ }
    }
    deleteClip(req.params.clipId);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/render', async (req, res) => {
    try {
      await enqueueProjectRender(req.params.id, {
        allRatios: Boolean(req.body?.allRatios),
        clipIds: req.body?.clipIds as string[] | undefined,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to start render' });
    }
  });

  app.post('/api/projects/:id/pause', (req, res) => {
    pauseProjectQueue(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/resume', (req, res) => {
    resumeProjectQueue(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/cancel', (req, res) => {
    cancelProjectQueue(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/projects/:id/find-more', async (req, res) => {
    try {
      const result = await findMoreMomentsForProject(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Could not find more moments' });
    }
  });

  app.post('/api/clips/:clipId/rerender', async (req, res) => {
    await enqueueSingleClipRerender(req.params.clipId, req.body?.ratio as AspectRatio | undefined);
    res.json({ ok: true });
  });

  // Stream source video for manual editor player
  app.get('/api/projects/:id/source-video', (req, res) => {
    const project = getProject(req.params.id);
    if (!project || !project.sourcePath) return res.status(404).end();
    streamVideoWithRange(req, res, project.sourcePath, 'video/mp4');
  });

  // Stream rendered clip video
  app.get('/api/clips/:clipId/video', (req, res) => {
    const clip = getClip(req.params.clipId);
    if (!clip || !clip.outputPath) return res.status(404).end();
    streamVideoWithRange(req, res, clip.outputPath, 'video/mp4');
  });

  app.get('/api/clips/:clipId/thumbnail', (req, res) => {
    const clip = getClip(req.params.clipId);
    if (!clip || !clip.thumbnailPath || !fs.existsSync(clip.thumbnailPath)) {
      return res.status(404).end();
    }
    res.sendFile(clip.thumbnailPath);
  });

  app.get('/api/clips/:clipId/download', (req, res) => {
    const clip = getClip(req.params.clipId);
    if (!clip || !clip.outputPath || !fs.existsSync(clip.outputPath)) {
      return res.status(404).json({ error: 'Rendered file not ready yet.' });
    }
    const idx = String(clip.orderIndex + 1).padStart(3, '0');
    const name = `clip-${idx}_${formatTimeShortFile(clip.startTime)}_score${clip.score}.mp4`;
    res.download(clip.outputPath, name);
  });

  // Streaming ZIP export for 1 to 100+ clips with near-zero RAM usage
  app.get('/api/projects/:id/download-zip', (req, res) => {
    const project = getProject(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const readyClips = getClipsForProject(project.id).filter(
      (c) => !c.isRunnerUp && c.status === 'completed' && c.outputPath && fs.existsSync(c.outputPath)
    );
    if (readyClips.length === 0) {
      return res.status(400).json({ error: 'No finished clips are ready to zip yet.' });
    }

    const safeTitle = (project.title || 'clips').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_clips.zip"`);

    const ZipArchiveCtor = (
      archiverPkg as unknown as {
        ZipArchive: new (opts?: { zlib?: { level?: number } }) => archiverPkg.Archiver;
      }
    ).ZipArchive;
    const archive = new ZipArchiveCtor({ zlib: { level: 1 } }); // Fast streaming store/level 1 for already-compressed MP4
    archive.on('error', (err: Error) => {
      res.status(500).end(err.message);
    });
    archive.pipe(res);

    for (const c of readyClips) {
      if (c.outputPath) {
        const idx = String(c.orderIndex + 1).padStart(3, '0');
        const ratioTag = c.ratio.replace(':', 'x');
        const entryName = `clip-${idx}_${formatTimeShortFile(c.startTime)}_score${c.score}_${ratioTag}.mp4`;
        archive.file(c.outputPath, { name: entryName });
      }
    }

    // Vyro Campaign Mode: one post_captions.txt with the submit checklist and
    // a ready-to-paste caption (#ad first) for every clip in the batch.
    const campaign = getCampaign(project.style.campaignId);
    if (campaign) {
      archive.append(buildBatchPostCaptions(campaign, readyClips), {
        name: 'post_captions.txt',
      });
    }

    void archive.finalize();
  });

  return app;
}
