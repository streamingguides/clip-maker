import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Pause,
  Play,
  Sliders,
  XCircle,
} from 'lucide-react';
import { formatTime } from '../shared/styles.ts';
import type { ClipItem, ProjectRecord } from '../shared/types.ts';

interface ProgressScreenProps {
  project: ProjectRecord;
  clips: ClipItem[];
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onGoToResults: () => void;
  onGoToEditor: () => void;
  onBackToStart: () => void;
}

const STAGES = [
  { key: 'downloading', label: 'Downloading / Loading Video' },
  { key: 'probing', label: 'Reading Audio & Waveform' },
  { key: 'transcribing', label: 'Making Word-Synced Captions' },
  { key: 'analyzing', label: 'Finding Best Moments' },
  { key: 'rendering', label: 'Rendering Short Clips' },
];

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  project,
  clips,
  onPause,
  onResume,
  onCancel,
  onGoToResults,
  onGoToEditor,
  onBackToStart,
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);

  const primaryClips = clips.filter((c) => !c.isRunnerUp);
  const completedClips = primaryClips.filter((c) => c.status === 'completed');
  const renderingClips = primaryClips.filter((c) => c.status === 'rendering');

  const stageOrder = ['created', 'downloading', 'probing', 'transcribing', 'analyzing', 'ready', 'rendering', 'paused', 'completed'];
  const currentIdx = stageOrder.indexOf(project.stage);

  const remainingClips = primaryClips.filter(
    (c) => c.status === 'queued' || c.status === 'rendering'
  ).length;
  const estSecondsLeft = remainingClips * 6;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{project.title}</h2>
            <p className="text-sm text-slate-600 mt-0.5">{project.stageMessage}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {project.stage === 'rendering' && (
              <button
                type="button"
                onClick={onPause}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}
            {project.stage === 'paused' && (
              <button
                type="button"
                onClick={onResume}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
              >
                <Play className="w-3.5 h-3.5" />
                Resume
              </button>
            )}
            {(project.stage === 'rendering' || project.stage === 'paused') && (
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50"
              >
                <XCircle className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
            {(project.stage === 'ready' || project.stage === 'completed') && (
              <button
                type="button"
                onClick={onGoToEditor}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <Sliders className="w-3.5 h-3.5" />
                Open Editor
              </button>
            )}
            {completedClips.length > 0 && (
              <button
                type="button"
                onClick={onGoToResults}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                View {completedClips.length} Ready Clips
              </button>
            )}
          </div>
        </div>

        {/* Main Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs font-mono-tabular text-slate-600 mb-1.5">
            <span>
              {primaryClips.length > 0
                ? `Clip ${completedClips.length} of ${primaryClips.length} finished`
                : project.stageMessage}
            </span>
            <span>
              {project.progress}%
              {remainingClips > 0 ? ` · ~${formatTime(estSecondsLeft)} left` : ''}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                project.stage === 'error'
                  ? 'bg-rose-600'
                  : project.stage === 'completed'
                    ? 'bg-emerald-600'
                    : 'bg-blue-600'
              }`}
              style={{ width: `${Math.max(4, project.progress)}%` }}
            />
          </div>
        </div>

        {/* Named Stages */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-2">
          {STAGES.map((st) => {
            const stIdx = stageOrder.indexOf(st.key);
            const isDone =
              project.stage === 'completed' ||
              (currentIdx > stIdx && project.stage !== 'error');
            const isActive = project.stage === st.key;
            return (
              <div
                key={st.key}
                className={`p-3 rounded-lg border text-xs ${
                  isDone
                    ? 'border-emerald-200 bg-emerald-50/50 text-emerald-900'
                    : isActive
                      ? 'border-blue-300 bg-blue-50/60 text-blue-900 font-medium'
                      : 'border-slate-200 bg-slate-50/50 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <span className="w-3.5 h-3.5 text-center font-mono-tabular">
                      {isActive ? '•' : '–'}
                    </span>
                  )}
                  <span className="truncate">{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">
          You can close this tab or refresh anytime — your queue keeps running and resumes automatically if the app restarts.
        </p>

        {/* Friendly Notice */}
        {project.noticeMessage && (
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            {project.noticeMessage}
          </div>
        )}

        {/* Friendly Error + Copyable yt-dlp Command */}
        {project.stage === 'error' && project.errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
            <div className="flex items-start gap-2.5 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-semibold text-sm">Could not finish automatically</div>
                <p>{project.errorMessage}</p>
              </div>
            </div>
            {project.manualCommandHint && (
              <div className="bg-white border border-rose-200 rounded-lg p-3 space-y-2">
                <div className="text-xs font-medium text-slate-700">
                  Run this command in your terminal, then drop the downloaded MP4 on the Start screen:
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono-tabular bg-slate-900 text-slate-100 px-3 py-2 rounded overflow-x-auto">
                    {project.manualCommandHint}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(project.manualCommandHint || '');
                      setCopiedCmd(true);
                      setTimeout(() => setCopiedCmd(false), 2000);
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-50 shrink-0 inline-flex items-center gap-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedCmd ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onBackToStart}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
            >
              Back to Start & Drop File
            </button>
          </div>
        )}
      </div>

      {/* Currently Rendering + Live Finished Clips */}
      {renderingClips.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <div className="text-xs font-semibold text-slate-800">Rendering Now</div>
          {renderingClips.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-4 text-xs py-1">
              <span className="truncate font-medium text-slate-900">{c.title}</span>
              <span className="font-mono-tabular text-blue-700 shrink-0">{c.progress}%</span>
            </div>
          ))}
        </div>
      )}

      {completedClips.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Finished Clips (appearing as soon as ready)
            </h3>
            <a
              href={`/api/projects/${project.id}/download-zip`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download Ready ({completedClips.length}) ZIP
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedClips.map((c) => (
              <div
                key={c.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
              >
                <div className="aspect-video bg-slate-950 relative">
                  <video
                    src={`/api/clips/${c.id}/video`}
                    controls
                    preload="metadata"
                    poster={c.thumbnailPath ? `/api/clips/${c.id}/thumbnail` : undefined}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-3.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{c.title}</div>
                    <div className="text-[11px] font-mono-tabular text-slate-500">
                      {formatTime(c.startTime)}–{formatTime(c.endTime)} · {c.ratio} · Score {c.score}
                    </div>
                  </div>
                  <a
                    href={`/api/clips/${c.id}/download`}
                    className="p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
                    title="Download MP4"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
