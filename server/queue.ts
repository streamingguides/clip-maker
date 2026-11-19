import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'express';
import {
  CACHE_DIR,
  db,
  deleteAutoClipsForProject,
  getClip,
  getClipsForProject,
  getProject,
  getSettings,
  getSourceCache,
  insertClip,
  setSourceCache,
  updateClip,
  updateProject,
} from './db.ts';
import {
  analyzeAudioAndScenes,
  downloadWithYtDlp,
  generateSampleVideo,
  hashFileQuick,
  hashString,
  probeMedia,
} from './media.ts';
import { detectBestMoments, parseChatSpikes } from './moments.ts';
import {
  applyCampaignMeta,
  getCampaign,
  getCampaignUsedRanges,
  recordCampaignMoments,
} from './campaigns.ts';
import { renderSingleClip } from './render.ts';
import { transcribeMedia } from './transcribe.ts';
import { isRtlLanguage } from '../src/shared/styles.ts';
import type { AspectRatio, ClipItem } from '../src/shared/types.ts';

const sseClients = new Map<string, Set<Response>>();
const pausedProjects = new Set<string>();
const cancelledProjects = new Set<string>();
let activeWorkers = 0;
let queueRunning = false;

export function subscribeProjectEvents(projectId: string, res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  let set = sseClients.get(projectId);
  if (!set) {
    set = new Set();
    sseClients.set(projectId, set);
  }
  set.add(res);

  // Send immediate snapshot
  const project = getProject(projectId);
  const clips = getClipsForProject(projectId);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', project, clips })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  res.on('close', () => {
    clearInterval(keepAlive);
    set?.delete(res);
  });
}

export function broadcastProjectEvent(projectId: string, payload: unknown): void {
  const set = sseClients.get(projectId);
  if (!set || set.size === 0) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try {
      res.write(line);
    } catch {
      set.delete(res);
    }
  }
}

function emitState(projectId: string): void {
  const project = getProject(projectId);
  const clips = getClipsForProject(projectId);
  if (project) {
    broadcastProjectEvent(projectId, { type: 'snapshot', project, clips });
  }
}

export async function processProjectAnalysis(projectId: string): Promise<void> {
  const project = getProject(projectId);
  if (!project) return;
  const settings = getSettings();

  try {
    cancelledProjects.delete(projectId);
    pausedProjects.delete(projectId);

    let videoPath = project.sourcePath ?? '';
    let cacheKey = project.sourceHash ?? '';
    let title = project.title;
    let creatorName = project.creatorName || settings.defaultCreatorName || 'Creator';
    let subtitleFiles: string[] = [];
    let chatFile: string | undefined;

    if (project.sourceType === 'sample') {
      cacheKey = 'sample_demo_v1';
      videoPath = path.join(CACHE_DIR, 'sample_demo.mp4');
      if (!fs.existsSync(videoPath)) {
        updateProject(projectId, {
          stage: 'downloading',
          stageMessage: 'Creating built-in test video...',
          progress: 15,
        });
        emitState(projectId);
        await generateSampleVideo(videoPath);
      }
      title = 'Clip Maker Demo Video';
      creatorName = settings.defaultCreatorName || 'Clip Maker Studio';
    } else if (project.sourceType === 'url' && project.sourceUrl) {
      cacheKey = `url_${hashString(project.sourceUrl)}`;
      const cached = getSourceCache(cacheKey);
      if (cached) {
        videoPath = cached.sourcePath;
        title = cached.title;
        creatorName = settings.defaultCreatorName || cached.creatorName;
        updateProject(projectId, {
          sourcePath: cached.sourcePath,
          sourceHash: cacheKey,
          title,
          creatorName,
          durationSec: cached.durationSec,
          width: cached.width,
          height: cached.height,
          fps: cached.fps,
          hasSpeech: cached.hasSpeech,
          transcript: cached.transcript,
          waveformPeaks: cached.waveformPeaks,
          stage: 'analyzing',
          stageMessage: 'Reusing cached video & transcript...',
          progress: 72,
        });
        emitState(projectId);
      } else {
        updateProject(projectId, {
          stage: 'downloading',
          stageMessage: 'Preparing download...',
          progress: 5,
        });
        emitState(projectId);

        const dl = await downloadWithYtDlp(
          project.sourceUrl,
          cacheKey,
          settings.cookiesBrowser,
          project.language,
          (pct, msg) => {
            updateProject(projectId, {
              stage: 'downloading',
              stageMessage: msg,
              progress: Math.round(pct * 0.4),
            });
            emitState(projectId);
          }
        );
        videoPath = dl.videoPath;
        title = dl.title;
        creatorName = settings.defaultCreatorName || dl.creatorName;
        subtitleFiles = dl.subtitleFiles;
        chatFile = dl.chatFile;
      }
    } else if (project.sourceType === 'upload' && videoPath) {
      if (!fs.existsSync(videoPath)) {
        throw new Error('Uploaded file could not be found on disk.');
      }
      cacheKey = `file_${await hashFileQuick(videoPath)}`;
    }

    let freshProject = getProject(projectId)!;
    const cached = getSourceCache(cacheKey);

    let durationSec = cached?.durationSec ?? freshProject.durationSec;
    let width = cached?.width ?? freshProject.width;
    let height = cached?.height ?? freshProject.height;
    let fps = cached?.fps ?? freshProject.fps;
    let transcript = cached?.transcript ?? [];
    let waveformPeaks = cached?.waveformPeaks ?? [];
    let hasSpeech = cached?.hasSpeech ?? true;
    let chatSpikes = cached?.chatSpikes ?? [];
    let noticeMessage: string | undefined;

    updateProject(projectId, {
      sourcePath: videoPath,
      sourceHash: cacheKey,
      title,
      creatorName,
      stage: 'probing',
      stageMessage: 'Reading video size, audio & waveform...',
      progress: 45,
    });
    emitState(projectId);

    const probe = await probeMedia(videoPath);
    durationSec = probe.durationSec;
    width = probe.width;
    height = probe.height;
    fps = probe.fps;
    if (!title || title === 'New Clip Project') {
      title = probe.title || path.basename(videoPath, path.extname(videoPath));
    }

    const audioAnalysis = await analyzeAudioAndScenes(
      videoPath,
      cacheKey,
      durationSec,
      probe.hasAudio
    );
    waveformPeaks = audioAnalysis.waveformPeaks;
    if (chatFile) {
      chatSpikes = parseChatSpikes(chatFile, durationSec);
    }

    if (!cached || cached.transcript.length === 0) {
      updateProject(projectId, {
        durationSec,
        width,
        height,
        fps,
        waveformPeaks,
        stage: 'transcribing',
        stageMessage:
          subtitleFiles.length > 0
            ? 'Loading captions from video...'
            : 'Extracting speech & word timestamps...',
        progress: 62,
      });
      emitState(projectId);

      const tr = await transcribeMedia({
        subtitleFiles,
        audioAnalysis,
        whisperModel: settings.whisperModel,
        language: freshProject.language,
        isSample: project.sourceType === 'sample',
        durationSec,
      });
      transcript = tr.segments;
      hasSpeech = tr.hasSpeech;
      noticeMessage = tr.notice;

      setSourceCache({
        cacheKey,
        sourcePath: videoPath,
        title,
        creatorName,
        durationSec,
        width,
        height,
        fps,
        hasSpeech,
        transcript,
        waveformPeaks,
        chatSpikes,
      });
    }

    const updatedStyle = {
      ...freshProject.style,
      captions: {
        ...freshProject.style.captions,
        rtl:
          freshProject.style.captions.rtl || isRtlLanguage(freshProject.language),
        enabled: hasSpeech ? freshProject.style.captions.enabled : false,
      },
    };

    updateProject(projectId, {
      title,
      creatorName,
      durationSec,
      width,
      height,
      fps,
      hasSpeech,
      transcript,
      waveformPeaks,
      style: updatedStyle,
      noticeMessage: noticeMessage ?? null,
      stage: 'analyzing',
      stageMessage:
        freshProject.mode === 'manual'
          ? 'Ready for manual clip selection...'
          : 'Finding best viral moments...',
      progress: 82,
    });
    emitState(projectId);

    freshProject = getProject(projectId)!;

    if (freshProject.mode === 'auto' || freshProject.mode === 'mixed') {
      deleteAutoClipsForProject(projectId);
      // Vyro Campaign Mode: never re-clip a moment already used for this
      // campaign on this source video (duplicate protection across projects).
      const campaign = getCampaign(freshProject.style.campaignId);
      const { clips, runnerUps, shortageNotice } = await detectBestMoments({
        projectId,
        durationSec,
        requestedCount: freshProject.requestedCount,
        targetClipLength: freshProject.targetClipLength,
        creatorName,
        ratio: freshProject.style.ratio,
        transcript,
        audioAnalysis,
        chatSpikes,
        useOllama: settings.useOllamaIfRunning,
        existingRanges: campaign
          ? getCampaignUsedRanges(campaign.id, cacheKey)
          : undefined,
      });

      if (campaign) {
        for (const c of clips) applyCampaignMeta(campaign, c);
        recordCampaignMoments(
          campaign.id,
          cacheKey,
          clips.map((c) => ({ start: c.startTime, end: c.endTime }))
        );
      }
      for (const c of clips) insertClip(c);
      for (const ru of runnerUps) insertClip(ru);

      const combinedNotice = [noticeMessage, shortageNotice].filter(Boolean).join(' ');
      updateProject(projectId, {
        noticeMessage: combinedNotice || null,
      });

      if (freshProject.mode === 'auto') {
        await enqueueProjectRender(projectId, { allRatios: freshProject.allRatios });
        return;
      }
    }

    updateProject(projectId, {
      stage: 'ready',
      stageMessage: 'Ready to edit & export clips',
      progress: 100,
    });
    emitState(projectId);
  } catch (err) {
    const e = err as Error & { manualCommandHint?: string };
    updateProject(projectId, {
      stage: 'error',
      stageMessage: 'Could not prepare this video',
      errorMessage: e.message || 'Unknown processing error',
      manualCommandHint: e.manualCommandHint ?? null,
    });
    emitState(projectId);
  }
}

export async function findMoreMomentsForProject(projectId: string): Promise<{ added: number; notice?: string }> {
  const project = getProject(projectId);
  if (!project || !project.sourcePath || !project.sourceHash) {
    throw new Error('Project video is not ready yet.');
  }
  const existing = getClipsForProject(projectId).filter((c) => !c.isRunnerUp);
  const audioAnalysis = await analyzeAudioAndScenes(
    project.sourcePath,
    project.sourceHash,
    project.durationSec,
    true
  );
  const campaign = getCampaign(project.style.campaignId);
  const { clips, shortageNotice } = await detectBestMoments({
    projectId,
    durationSec: project.durationSec,
    requestedCount: 5,
    targetClipLength: project.targetClipLength,
    creatorName: project.creatorName,
    ratio: project.style.ratio,
    transcript: project.transcript,
    audioAnalysis,
    existingRanges: [
      ...existing.map((c) => ({ start: c.startTime, end: c.endTime })),
      ...(campaign
        ? getCampaignUsedRanges(campaign.id, project.sourceHash)
        : []),
    ],
  });

  let nextIdx = existing.length;
  for (const c of clips) {
    c.orderIndex = nextIdx++;
    c.status = 'queued';
    if (campaign) applyCampaignMeta(campaign, c);
    insertClip(c);
  }
  if (campaign && clips.length > 0) {
    recordCampaignMoments(
      campaign.id,
      project.sourceHash,
      clips.map((c) => ({ start: c.startTime, end: c.endTime }))
    );
  }

  if (clips.length > 0) {
    updateProject(projectId, {
      stage: 'rendering',
      stageMessage: `Queued ${clips.length} more moments...`,
    });
    emitState(projectId);
    void drainRenderQueue();
  }
  return { added: clips.length, notice: shortageNotice };
}

export async function enqueueProjectRender(
  projectId: string,
  opts?: { allRatios?: boolean; clipIds?: string[] }
): Promise<void> {
  const project = getProject(projectId);
  if (!project) return;
  cancelledProjects.delete(projectId);
  pausedProjects.delete(projectId);

  // Disk space guard before big batch
  try {
    const stat = fs.statfsSync(process.cwd());
    const freeMb = (stat.bavail * stat.bsize) / (1024 * 1024);
    if (freeMb < 350) {
      throw new Error(
        `Low disk space (${Math.round(freeMb)} MB free). Please free up space before rendering.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Low disk space')) throw err;
  }

  let primaryClips = getClipsForProject(projectId).filter((c) => !c.isRunnerUp);
  if (opts?.clipIds && opts.clipIds.length > 0) {
    const idSet = new Set(opts.clipIds);
    primaryClips = primaryClips.filter((c) => idSet.has(c.id));
  }

  if (primaryClips.length === 0) {
    updateProject(projectId, {
      stage: 'ready',
      stageMessage: 'Add at least one clip to render',
      progress: 100,
    });
    emitState(projectId);
    return;
  }

  // If allRatios requested, clone draft clips for missing ratios (9:16, 1:1, 4:5, 16:9)
  if (opts?.allRatios) {
    const allFour: AspectRatio[] = ['9:16', '1:1', '4:5', '16:9'];
    const existingAll = getClipsForProject(projectId).filter((c) => !c.isRunnerUp);
    let nextOrder = existingAll.length;
    for (const baseClip of primaryClips) {
      for (const r of allFour) {
        if (r === baseClip.ratio) continue;
        const already = existingAll.some(
          (ex) =>
            Math.abs(ex.startTime - baseClip.startTime) < 0.5 &&
            Math.abs(ex.endTime - baseClip.endTime) < 0.5 &&
            ex.ratio === r
        );
        if (!already) {
          const clone: ClipItem = {
            ...baseClip,
            id: crypto.randomUUID(),
            orderIndex: nextOrder++,
            ratio: r,
            status: 'queued',
            progress: 0,
            outputPath: null,
            thumbnailPath: null,
            fileSizeBytes: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          insertClip(clone);
        }
      }
    }
  }

  // Queue all primary clips that are not already completed (unless re-rendering)
  const refreshed = getClipsForProject(projectId).filter((c) => !c.isRunnerUp);
  for (const c of refreshed) {
    if (c.status !== 'completed') {
      updateClip(c.id, { status: 'queued', progress: 0, errorMessage: null });
    }
  }

  updateProject(projectId, {
    stage: 'rendering',
    stageMessage: 'Starting batch render queue...',
    progress: 5,
    errorMessage: null,
  });
  emitState(projectId);
  void drainRenderQueue();
}

export async function enqueueSingleClipRerender(
  clipId: string,
  ratioOverride?: AspectRatio
): Promise<void> {
  const clip = getClip(clipId);
  if (!clip) return;
  pausedProjects.delete(clip.projectId);
  cancelledProjects.delete(clip.projectId);

  updateClip(clipId, {
    ratio: ratioOverride ?? clip.ratio,
    status: 'queued',
    progress: 0,
    errorMessage: null,
  });
  updateProject(clip.projectId, {
    stage: 'rendering',
    stageMessage: `Re-rendering "${clip.title}"...`,
  });
  emitState(clip.projectId);
  void drainRenderQueue();
}

export function pauseProjectQueue(projectId: string): void {
  pausedProjects.add(projectId);
  updateProject(projectId, {
    stage: 'paused',
    stageMessage: 'Queue paused. Your progress is saved.',
  });
  emitState(projectId);
}

export function resumeProjectQueue(projectId: string): void {
  pausedProjects.delete(projectId);
  cancelledProjects.delete(projectId);
  updateProject(projectId, {
    stage: 'rendering',
    stageMessage: 'Resuming render queue...',
  });
  emitState(projectId);
  void drainRenderQueue();
}

export function cancelProjectQueue(projectId: string): void {
  cancelledProjects.add(projectId);
  pausedProjects.delete(projectId);
  const clips = getClipsForProject(projectId);
  for (const c of clips) {
    if (c.status === 'queued') {
      updateClip(c.id, { status: 'cancelled', progress: 0 });
    }
  }
  updateProject(projectId, {
    stage: 'ready',
    stageMessage: 'Render queue cancelled',
  });
  emitState(projectId);
}

function getNextQueuedClip(): ClipItem | null {
  const rows = db
    .prepare(
      "SELECT id, project_id FROM clips WHERE status = 'queued' AND is_runner_up = 0 ORDER BY order_index ASC, created_at ASC"
    )
    .all() as Array<{ id: string; project_id: string }>;

  for (const r of rows) {
    if (pausedProjects.has(r.project_id) || cancelledProjects.has(r.project_id)) {
      continue;
    }
    return getClip(r.id);
  }
  return null;
}

function refreshProjectRenderProgress(projectId: string): void {
  const project = getProject(projectId);
  if (!project) return;
  const clips = getClipsForProject(projectId).filter((c) => !c.isRunnerUp);
  if (clips.length === 0) return;

  const completed = clips.filter((c) => c.status === 'completed').length;
  const failed = clips.filter((c) => c.status === 'error').length;
  const pending = clips.filter((c) => c.status === 'queued' || c.status === 'rendering').length;

  const avgProgress =
    clips.reduce((sum, c) => sum + (c.status === 'completed' ? 100 : c.progress), 0) /
    clips.length;

  if (pending === 0 && !pausedProjects.has(projectId)) {
    updateProject(projectId, {
      stage: failed === clips.length ? 'error' : 'completed',
      stageMessage:
        failed > 0
          ? `Finished ${completed} clips (${failed} failed)`
          : `All ${completed} clips ready to download`,
      progress: 100,
    });
  } else if (!pausedProjects.has(projectId)) {
    updateProject(projectId, {
      stage: 'rendering',
      stageMessage: `Rendering clip ${Math.min(clips.length, completed + 1)} of ${clips.length}`,
      progress: Math.max(5, Math.round(avgProgress)),
    });
  }
  emitState(projectId);
}

export async function drainRenderQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;

  try {
    const spawnWorker = async () => {
      while (true) {
        const settings = getSettings();
        const maxConcurrency = Math.max(1, Math.min(4, settings.parallelRenders || 2));
        if (activeWorkers >= maxConcurrency) break;

        const clip = getNextQueuedClip();
        if (!clip) break;

        activeWorkers++;
        try {
          const project = getProject(clip.projectId);
          if (!project) continue;

          updateClip(clip.id, { status: 'rendering', progress: 2 });
          refreshProjectRenderProgress(clip.projectId);

          const res = await renderSingleClip({
            clip,
            project,
            onProgress: (pct) => {
              updateClip(clip.id, { progress: pct });
              refreshProjectRenderProgress(clip.projectId);
            },
          });

          updateClip(clip.id, {
            status: 'completed',
            progress: 100,
            outputPath: res.outputPath,
            thumbnailPath: res.thumbnailPath,
            fileSizeBytes: res.fileSizeBytes,
            errorMessage: null,
          });
          refreshProjectRenderProgress(clip.projectId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Render failed';
          updateClip(clip.id, {
            status: 'error',
            progress: 0,
            errorMessage: msg,
          });
          refreshProjectRenderProgress(clip.projectId);
        } finally {
          activeWorkers--;
        }
      }
    };

    const settings = getSettings();
    const workersCount = Math.max(1, Math.min(4, settings.parallelRenders || 2));
    await Promise.all(Array.from({ length: workersCount }, () => spawnWorker()));
  } finally {
    queueRunning = false;
    // Check if anything was queued while draining
    if (getNextQueuedClip()) {
      void drainRenderQueue();
    }
  }
}

// Automatically resume any queued clips left over from an interrupted session
export function resumePendingJobsOnStartup(): void {
  const pending = getNextQueuedClip();
  if (pending) {
    void drainRenderQueue();
  }
}
