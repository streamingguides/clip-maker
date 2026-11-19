import React, { useMemo, useState } from 'react';
import {
  Copy,
  Download,
  Layers,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { formatTime } from '../shared/styles.ts';
import type { AspectRatio, ClipItem, ProjectRecord } from '../shared/types.ts';

interface ResultsScreenProps {
  project: ProjectRecord;
  clips: ClipItem[];
  onRefresh: () => Promise<void>;
  onOpenEditor: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  project,
  clips,
  onRefresh,
  onOpenEditor,
}) => {
  const [sortBy, setSortBy] = useState<'score' | 'time'>('score');
  const [ratioFilter, setRatioFilter] = useState<'all' | AspectRatio>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const primaryClips = useMemo(() => {
    const base = clips.filter((c) => !c.isRunnerUp);
    const filtered =
      ratioFilter === 'all' ? base : base.filter((c) => c.ratio === ratioFilter);
    return [...filtered].sort((a, b) =>
      sortBy === 'score' ? b.score - a.score : a.startTime - b.startTime
    );
  }, [clips, sortBy, ratioFilter]);

  const completedCount = primaryClips.filter((c) => c.status === 'completed').length;

  const updateClip = async (clipId: string, patch: Partial<ClipItem>) => {
    await fetch(`/api/clips/${clipId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await onRefresh();
  };

  const rerenderClip = async (clipId: string, ratio?: AspectRatio) => {
    await fetch(`/api/clips/${clipId}/rerender`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratio }),
    });
    await onRefresh();
  };

  const generateAllRatios = async () => {
    setBusyAction('Queuing all 4 ratios...');
    try {
      await fetch(`/api/projects/${project.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allRatios: true }),
      });
      await onRefresh();
    } finally {
      setBusyAction(null);
    }
  };

  const findMoreMoments = async () => {
    setBusyAction('Finding more moments...');
    try {
      await fetch(`/api/projects/${project.id}/find-more`, { method: 'POST' });
      await onRefresh();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Results Action Bar */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{project.title}</h2>
          <div className="text-xs text-slate-500 font-mono-tabular flex flex-wrap items-center gap-2 mt-0.5">
            <span>
              {completedCount} of {primaryClips.length} clips ready
            </span>
            {project.noticeMessage && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-amber-700">{project.noticeMessage}</span>
              </>
            )}
            {busyAction && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-blue-600">{busyAction}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sort */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setSortBy('score')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                sortBy === 'score' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Sort: Score
            </button>
            <button
              type="button"
              onClick={() => setSortBy('time')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                sortBy === 'time' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Sort: Time
            </button>
          </div>

          {/* Ratio Filter */}
          <select
            value={ratioFilter}
            onChange={(e) => setRatioFilter(e.target.value as 'all' | AspectRatio)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="all">All Ratios</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
            <option value="16:9">16:9</option>
          </select>

          <button
            type="button"
            onClick={() => void findMoreMoments()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Find More Moments
          </button>

          <button
            type="button"
            onClick={() => void generateAllRatios()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            Generate All Ratios
          </button>

          <button
            type="button"
            onClick={onOpenEditor}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            Edit Clips
          </button>

          <a
            href={completedCount > 0 ? `/api/projects/${project.id}/download-zip` : undefined}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
              completedCount > 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-200 text-slate-500 pointer-events-none'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Download All (ZIP)
          </a>
        </div>
      </div>

      {/* Results Grid */}
      {primaryClips.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-900">No clips in this project yet</div>
          <p className="text-xs text-slate-500">
            Open the Manual Editor to add clips or click Find More Moments above.
          </p>
          <button
            type="button"
            onClick={onOpenEditor}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
          >
            Open Editor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {primaryClips.map((clip) => (
            <div
              key={clip.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
            >
              {/* Video Player */}
              <div className="bg-slate-950 aspect-[9/12] max-h-80 relative flex items-center justify-center">
                {clip.status === 'completed' ? (
                  <video
                    src={`/api/clips/${clip.id}/video`}
                    controls
                    preload="metadata"
                    poster={clip.thumbnailPath ? `/api/clips/${clip.id}/thumbnail` : undefined}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center px-4 space-y-2">
                    <div className="text-xs font-medium text-slate-200 capitalize">
                      {clip.status === 'rendering'
                        ? `Rendering (${clip.progress}%)...`
                        : clip.status === 'queued'
                          ? 'Waiting in queue...'
                          : clip.status === 'error'
                            ? `Failed: ${clip.errorMessage || 'Error'}`
                            : 'Not rendered yet'}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2.5">
                  {/* Unboxed Metadata Line (Zero-Pill Rule) */}
                  <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-500">
                    <span>
                      {formatTime(clip.startTime)}–{formatTime(clip.endTime)} · {clip.ratio}
                      {clip.fileSizeBytes
                        ? ` · ${(clip.fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`
                        : ''}
                    </span>
                    <span className="font-semibold text-slate-900">
                      Score {clip.score}/100
                    </span>
                  </div>

                  {/* Reasons */}
                  <div className="text-xs text-slate-600">
                    {clip.reasons.join(' · ')}
                  </div>

                  {/* Editable Title */}
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Title</label>
                    <input
                      type="text"
                      defaultValue={clip.title}
                      onBlur={(e) => {
                        if (e.target.value !== clip.title) {
                          void updateClip(clip.id, { title: e.target.value });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg"
                    />
                  </div>

                  {/* Editable Hook */}
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">
                      Hook Headline (top box)
                    </label>
                    <input
                      type="text"
                      defaultValue={clip.hookText}
                      onBlur={(e) => {
                        if (e.target.value !== clip.hookText) {
                          void updateClip(clip.id, { hookText: e.target.value });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>

                  {/* Description + Copy */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="text-[11px] text-slate-500">
                        Post Description & Hashtags
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(clip.description);
                          setCopiedId(clip.id);
                          setTimeout(() => setCopiedId(null), 1500);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedId === clip.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      defaultValue={clip.description}
                      onBlur={(e) => {
                        if (e.target.value !== clip.description) {
                          void updateClip(clip.id, { description: e.target.value });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-[11px] text-slate-600 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={clip.ratio}
                      onChange={(e) =>
                        void rerenderClip(clip.id, e.target.value as AspectRatio)
                      }
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                      title="Switch ratio and re-render"
                    >
                      <option value="9:16">9:16</option>
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                      <option value="16:9">16:9</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void rerenderClip(clip.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
                      title="Re-render clip"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-render
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {clip.status === 'completed' && (
                      <a
                        href={`/api/clips/${clip.id}/download`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/clips/${clip.id}`, { method: 'DELETE' });
                        await onRefresh();
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Delete clip"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
