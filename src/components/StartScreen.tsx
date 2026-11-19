import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Film,
  Link2,
  Play,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react';
import { CAPTION_PRESETS, applyPresetToStyle, formatTime } from '../shared/styles.ts';
import { StyleCustomizer } from './StyleCustomizer.tsx';
import type {
  AspectRatio,
  ClipMode,
  ClipStyleConfig,
  ProjectRecord,
} from '../shared/types.ts';

interface StartScreenProps {
  defaultStyle: ClipStyleConfig;
  defaultCreatorName: string;
  recentProjects: Array<ProjectRecord & { clipCount: number; completedCount: number }>;
  onProjectCreated: (projectId: string) => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  defaultStyle,
  defaultCreatorName,
  recentProjects,
  onProjectCreated,
  onOpenProject,
  onDeleteProject,
}) => {
  const [url, setUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [mode, setMode] = useState<ClipMode>('auto');
  const [requestedCount, setRequestedCount] = useState(5);
  const [targetClipLength, setTargetClipLength] = useState(30);
  const [allRatios, setAllRatios] = useState(false);
  const [language, setLanguage] = useState('auto');
  const [deepAnalysis, setDeepAnalysis] = useState(false);
  const [creatorName, setCreatorName] = useState(defaultCreatorName);
  const [campaigns, setCampaigns] = useState<
    Array<{ id: string; platform: string; campaignName: string }>
  >([]);
  const [campaignId, setCampaignId] = useState('');
  const [style, setStyle] = useState<ClipStyleConfig>(defaultStyle);
  const [showMoreStyle, setShowMoreStyle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Vyro Campaign Mode presets (served from config/campaigns.json)
  useEffect(() => {
    void fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) =>
        setCampaigns(
          Array.isArray(list)
            ? (list as Array<{ id: string; platform: string; campaignName: string }>)
            : []
        )
      )
      .catch(() => setCampaigns([]));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const submitJob = async (useSample = false) => {
    setError(null);
    if (!permissionConfirmed) {
      setError('Please check the permission box first before continuing.');
      return;
    }
    if (!useSample && !selectedFile && !url.trim()) {
      setError('Paste a video link or drop a video file to begin.');
      return;
    }

    setSubmitting(true);
    try {
      let res: Response;
      if (useSample) {
        res = await fetch('/api/projects/sample', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            permissionConfirmed: true,
            mode,
            requestedCount,
            targetClipLength,
            allRatios,
            language,
            deepAnalysis,
            creatorName: creatorName || 'Clip Maker Demo',
            campaignId: campaignId || undefined,
            style,
          }),
        });
      } else if (selectedFile) {
        // Priority to uploaded file if both file and URL are provided
        const fd = new FormData();
        fd.append('file', selectedFile);
        fd.append('permissionConfirmed', 'true');
        fd.append('mode', mode);
        fd.append('requestedCount', String(requestedCount));
        fd.append('targetClipLength', String(targetClipLength));
        fd.append('allRatios', String(allRatios));
        fd.append('language', language);
        fd.append('deepAnalysis', String(deepAnalysis));
        fd.append('creatorName', creatorName);
        fd.append('style', JSON.stringify(style));
        if (campaignId) fd.append('campaignId', campaignId);
        res = await fetch('/api/projects/upload', { method: 'POST', body: fd });
      } else {
        res = await fetch('/api/projects/url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: url.trim(),
            permissionConfirmed: true,
            mode,
            requestedCount,
            targetClipLength,
            allRatios,
            language,
            deepAnalysis,
            creatorName,
            campaignId: campaignId || undefined,
            style,
          }),
        });
      }

      const data = (await res.json()) as { project?: ProjectRecord; error?: string };
      if (!res.ok || !data.project) {
        throw new Error(data.error || 'Could not start job');
      }
      onProjectCreated(data.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Intro Heading */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Turn any long video into ready-to-post short clips
          </h1>
          <p className="text-sm text-slate-600 mt-1.5">
            100% free on your own computer. Lambi video dein, aur perfect captions, voice aur ratio ke saath 1 se 100 clips banayein.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!permissionConfirmed) setPermissionConfirmed(true);
            setTimeout(() => void submitJob(true), 20);
          }}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="w-3.5 h-3.5 text-blue-600" />
          Try Built-in Test Video
        </button>
      </div>

      {/* Side-by-side URL & Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
        {/* URL Box */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Link2 className="w-4 h-4 text-blue-600" />
              Paste Video Link
            </div>
            <p className="text-xs text-slate-500 mt-1">
              YouTube, Facebook, or Twitch VOD link (yahan video link paste karein)
            </p>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="mt-4 w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
          <div className="mt-4 text-xs text-slate-500">
            If both a link and a file are given, the uploaded file on the right is used first.
          </div>
        </div>

        {/* File Upload Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-blue-600 bg-blue-50/60'
              : selectedFile
                ? 'border-emerald-500 bg-emerald-50/40'
                : 'border-dashed border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.mkv,.webm,.avi,.m4v,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setSelectedFile(f);
            }}
          />
          {selectedFile ? (
            <div className="space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-900 break-all">
                {selectedFile.name}
              </div>
              <div className="text-xs font-mono-tabular text-slate-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready from your computer
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="text-xs text-rose-600 hover:underline pt-1"
              >
                Remove file
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-7 h-7 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-900">
                Drop a video file here, or click to browse
              </div>
              <div className="text-xs text-slate-500">
                Apni video file yahan rakhein · MP4, MOV, MKV, WEBM, AVI · No size limit
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Options Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
        {/* Mode & Clip Count */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              1. How should clips be picked?
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'manual', label: 'Manual' },
                  { id: 'mixed', label: 'Mixed' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={`py-2 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === m.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {mode === 'auto'
                ? 'Finds best moments automatically and renders right away.'
                : mode === 'manual'
                  ? 'Opens video timeline & transcript so you pick clips yourself.'
                  : 'Finds best moments + 5 runner-ups so you can tweak before render.'}
            </p>
          </div>

          {/* Number of Clips 1-100 */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              2. Number of clips (1 to 100)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={requestedCount}
                onChange={(e) =>
                  setRequestedCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
                }
                disabled={mode === 'manual'}
                className="w-20 px-3 py-1.5 text-sm font-mono-tabular border border-slate-300 rounded-lg disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-1">
                {[3, 5, 10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={mode === 'manual'}
                    onClick={() => setRequestedCount(n)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-mono-tabular border transition-colors disabled:opacity-40 ${
                      requestedCount === n
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Clip Length */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              3. Clip length
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {[
                { val: 15, label: '15s' },
                { val: 30, label: '30s' },
                { val: 45, label: '45s' },
                { val: 60, label: '60s' },
                { val: 90, label: '90s' },
                { val: 0, label: 'Auto' },
              ].map((len) => (
                <button
                  key={len.label}
                  type="button"
                  onClick={() => setTargetClipLength(len.val)}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    targetClipLength === len.val
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {len.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Ratio, Language, Caption Style */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-5 border-t border-slate-100">
          {/* Ratio */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              4. Video shape (Ratio)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['9:16', '1:1', '4:5', '16:9'] as AspectRatio[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setStyle({ ...style, ratio: r })}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium transition-colors ${
                    style.ratio === r
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 mt-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allRatios}
                onChange={(e) => setAllRatios(e.target.checked)}
                className="accent-blue-600"
              />
              Create all 4 ratios for every clip
            </label>
          </div>

          {/* Language */}
          <div>
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              5. Spoken language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="auto">Auto-detect language</option>
              <option value="en">English</option>
              <option value="ur">Urdu (اردو)</option>
              <option value="ur-en">Urdu + English Mix</option>
              <option value="hi">Hindi (हिन्दी)</option>
              <option value="ar">Arabic (العربية)</option>
              <option value="ja">Japanese (日本語)</option>
            </select>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 mt-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={deepAnalysis}
                onChange={(e) => setDeepAnalysis(e.target.checked)}
                className="accent-blue-600"
              />
              Deep analysis (transcribe full video)
            </label>
          </div>

          {/* Caption Style */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-900">
                6. Caption look
              </label>
              <button
                type="button"
                onClick={() => setShowMoreStyle((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showMoreStyle ? 'Hide customizer' : 'Customize style & audio'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {CAPTION_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyle(applyPresetToStyle(style, p.id))}
                  className={`px-2.5 py-2 rounded-lg border text-left text-xs font-medium flex items-center justify-between ${
                    style.captions.presetId === p.id
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{p.name}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: p.config.highlightColor }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {showMoreStyle && (
          <div className="pt-2">
            <StyleCustomizer
              style={style}
              creatorName={creatorName}
              onChangeStyle={setStyle}
              onChangeCreator={setCreatorName}
            />
          </div>
        )}

        {/* Vyro Campaign Mode */}
        {campaigns.length > 0 && (
          <div className="pt-5 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              Campaign Mode (optional)
            </label>
            <select
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full sm:w-96 text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">No campaign — normal clips</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.platform} — {c.campaignName}
                </option>
              ))}
            </select>
            {campaignId && (
              <p className="text-[11px] text-slate-500 mt-1.5 max-w-2xl">
                Campaign Mode burns the #ad disclosure onto every clip, adds the
                campaign hashtags &amp; mention to each post caption, keeps clip
                length inside the campaign range, prevents clipping the same
                moment twice for this campaign, and adds post captions + the
                Vyro submit checklist to your ZIP download.
              </p>
            )}
          </div>
        )}

        {/* Permission + Generate */}
        <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <label className="inline-flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={permissionConfirmed}
              onChange={(e) => setPermissionConfirmed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
            />
            <span>
              I own this video or have permission from the creator to clip it.
              <span className="block text-[11px] text-slate-500">
                Everything stays private on your computer.
              </span>
              {campaignId && (
                <span className="block text-[11px] text-amber-700 font-medium">
                  Campaign Mode: only clip footage from Vyro campaigns you have
                  joined.
                </span>
              )}
            </span>
          </label>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitJob(false)}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {submitting
              ? 'Starting...'
              : mode === 'manual'
                ? 'Open Manual Editor'
                : 'Generate Clips'}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Projects</h2>
            <span className="text-xs text-slate-500 font-mono-tabular">
              {recentProjects.length} saved locally
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {recentProjects.map((p) => (
              <div
                key={p.id}
                className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onOpenProject(p.id)}
                  className="flex items-center gap-3 text-left min-w-0 flex-1"
                >
                  <Film className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {p.title}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 font-mono-tabular">
                      <span className="capitalize">{p.mode}</span>
                      <span aria-hidden="true">·</span>
                      <span>{p.durationSec > 0 ? formatTime(p.durationSec) : 'Preparing'}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {p.completedCount}/{p.clipCount} clips ready
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{p.stage}</span>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenProject(p.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-white"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteProject(p.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete project"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
