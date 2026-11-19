import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ClipboardList,
  CopyPlus,
  Edit3,
  Pause,
  Play,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { formatTime, parseTimestamp } from '../shared/styles.ts';
import { ClipPreviewPlayer } from './ClipPreviewPlayer.tsx';
import { StyleCustomizer } from './StyleCustomizer.tsx';
import type {
  ClipItem,
  ClipStyleConfig,
  ProjectRecord,
  TranscriptSegment,
} from '../shared/types.ts';

interface ManualEditorScreenProps {
  project: ProjectRecord;
  clips: ClipItem[];
  onRefresh: () => Promise<void>;
  onStartRender: (allRatios: boolean) => Promise<void>;
}

export const ManualEditorScreen: React.FC<ManualEditorScreenProps> = ({
  project,
  clips,
  onRefresh,
  onStartRender,
}) => {
  const fullVideoRef = useRef<HTMLVideoElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);

  const primaryClips = useMemo(
    () => clips.filter((c) => !c.isRunnerUp).sort((a, b) => a.orderIndex - b.orderIndex),
    [clips]
  );
  const runnerUps = useMemo(() => clips.filter((c) => c.isRunnerUp), [clips]);

  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    primaryClips[0]?.id ?? null
  );
  const selectedClip =
    primaryClips.find((c) => c.id === selectedClipId) ?? primaryClips[0] ?? null;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Dragging range on waveform
  const [dragStartSec, setDragStartSec] = useState<number | null>(null);
  const [dragEndSec, setDragEndSec] = useState<number | null>(null);

  // Typed time inputs
  const [typedStart, setTypedStart] = useState('00:00');
  const [typedEnd, setTypedEnd] = useState('00:30');
  const [typedTitle, setTypedTitle] = useState('');

  // Paste list modal
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState('');

  // Transcript search & inline edit
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [editingSegId, setEditingSegId] = useState<string | null>(null);
  const [editingSegText, setEditingSegText] = useState('');

  const [showStylePanel, setShowStylePanel] = useState(false);
  const [allRatios, setAllRatios] = useState(project.allRatios);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  const sourceVideoUrl = project.sourcePath
    ? `/api/projects/${project.id}/source-video`
    : null;
  const duration = Math.max(1, project.durationSec || 60);

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(duration, sec));
    if (fullVideoRef.current) {
      fullVideoRef.current.currentTime = clamped;
    }
    setCurrentTime(clamped);
  };

  const togglePlay = () => {
    const v = fullVideoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  };

  const addClipRange = async (start: number, end: number, title?: string) => {
    setBusyMsg('Adding clip...');
    try {
      const res = await fetch(`/api/projects/${project.id}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: start,
          endTime: end,
          title,
          snapToWords: true,
        }),
      });
      const data = (await res.json()) as { clips?: ClipItem[] };
      await onRefresh();
      if (data.clips?.[0]) setSelectedClipId(data.clips[0].id);
    } finally {
      setBusyMsg(null);
    }
  };

  const handleAddAtPlayhead = () => {
    const len = project.targetClipLength > 0 ? project.targetClipLength : 30;
    const start = Math.max(0, Math.min(currentTime, Math.max(0, duration - 4)));
    const end = Math.min(duration, start + len);
    void addClipRange(start, end);
  };

  const handleAddTypedRange = () => {
    const s = parseTimestamp(typedStart);
    const e = parseTimestamp(typedEnd);
    if (s == null || e == null || e <= s) {
      setBusyMsg('Please enter valid start and end times (example: 01:15 and 01:45).');
      setTimeout(() => setBusyMsg(null), 3000);
      return;
    }
    void addClipRange(s, e, typedTitle.trim() || undefined);
    setTypedTitle('');
  };

  const handlePasteListSubmit = async () => {
    if (!pastedText.trim()) return;
    setBusyMsg('Adding timestamp list...');
    try {
      await fetch(`/api/projects/${project.id}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pastedList: pastedText, snapToWords: true }),
      });
      setPastedText('');
      setShowPasteModal(false);
      await onRefresh();
    } finally {
      setBusyMsg(null);
    }
  };

  const updateClipField = async (clipId: string, patch: Partial<ClipItem>) => {
    await fetch(`/api/clips/${clipId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await onRefresh();
  };

  const moveClip = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= primaryClips.length) return;
    const copy = [...primaryClips];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    await fetch(`/api/projects/${project.id}/clips/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: copy.map((c) => c.id) }),
    });
    await onRefresh();
  };

  const saveTranscriptEdit = async (seg: TranscriptSegment) => {
    const updatedTokens = editingSegText.trim().split(/\s+/).filter(Boolean);
    if (updatedTokens.length === 0) return;
    const step = (seg.end - seg.start) / updatedTokens.length;
    const nextTranscript = project.transcript.map((s) => {
      if (s.id !== seg.id) return s;
      return {
        ...s,
        text: updatedTokens.join(' '),
        words: updatedTokens.map((w, idx) => ({
          id: `${s.id}_ed_${idx}`,
          word: w,
          start: Math.round((s.start + idx * step) * 1000) / 1000,
          end: Math.round((s.start + (idx + 1) * step) * 1000) / 1000,
        })),
      };
    });

    await fetch(`/api/projects/${project.id}/transcript`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: nextTranscript }),
    });
    setEditingSegId(null);
    await onRefresh();
  };

  const saveProjectStyle = async (nextStyle: ClipStyleConfig, nextCreator?: string) => {
    await fetch(`/api/projects/${project.id}/style`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        style: nextStyle,
        creatorName: nextCreator ?? project.creatorName,
      }),
    });
    await onRefresh();
  };

  // Waveform pointer handlers
  const getWaveformTime = (clientX: number): number => {
    const el = waveformRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duration * 10) / 10;
  };

  const filteredTranscript = useMemo(() => {
    const q = transcriptQuery.trim().toLowerCase();
    if (!q) return project.transcript;
    return project.transcript.filter((s) => s.text.toLowerCase().includes(q));
  }, [project.transcript, transcriptQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{project.title}</h2>
          <div className="text-xs text-slate-500 font-mono-tabular flex flex-wrap items-center gap-2 mt-0.5">
            <span>Duration {formatTime(duration)}</span>
            <span aria-hidden="true">·</span>
            <span>{primaryClips.length}/100 clips</span>
            {busyMsg && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-blue-600 font-sans font-medium">{busyMsg}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowStylePanel((v) => !v)}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            {showStylePanel ? 'Hide Style & Audio' : 'Style & Audio'}
          </button>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer whitespace-nowrap">
            <input
              type="checkbox"
              checked={allRatios}
              onChange={(e) => setAllRatios(e.target.checked)}
              className="accent-blue-600"
            />
            All 4 Ratios
          </label>
          <button
            type="button"
            disabled={primaryClips.length === 0}
            onClick={() => void onStartRender(allRatios)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-40 whitespace-nowrap"
          >
            Render {primaryClips.length} Clips
          </button>
        </div>
      </div>

      {showStylePanel && (
        <StyleCustomizer
          style={project.style}
          creatorName={project.creatorName}
          onChangeStyle={(s) => void saveProjectStyle(s)}
          onChangeCreator={(name) => void saveProjectStyle(project.style, name)}
        />
      )}

      {/* Main 12-col Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Full Video Player + Waveform Timeline + Manual Add Tools */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="relative bg-slate-950 rounded-lg overflow-hidden aspect-video">
              {sourceVideoUrl ? (
                <video
                  ref={fullVideoRef}
                  src={sourceVideoUrl}
                  onTimeUpdate={() => {
                    if (fullVideoRef.current) setCurrentTime(fullVideoRef.current.currentTime);
                  }}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                  Source video loading...
                </div>
              )}

              {/* Interactive Split Screen Boxes when layout === 'split' */}
              {project.style.layout === 'split' && (
                <div className="absolute inset-0 pointer-events-none">
                  <div
                    className="absolute border-2 border-blue-400 bg-blue-500/15 text-[10px] text-white font-semibold px-1.5 py-0.5"
                    style={{
                      left: `${project.style.split.top.x * 100}%`,
                      top: `${project.style.split.top.y * 100}%`,
                      width: `${project.style.split.top.w * 100}%`,
                      height: `${project.style.split.top.h * 100}%`,
                    }}
                  >
                    Top (Gameplay)
                  </div>
                  <div
                    className="absolute border-2 border-emerald-400 bg-emerald-500/15 text-[10px] text-white font-semibold px-1.5 py-0.5"
                    style={{
                      left: `${project.style.split.bottom.x * 100}%`,
                      top: `${project.style.split.bottom.y * 100}%`,
                      width: `${project.style.split.bottom.w * 100}%`,
                      height: `${project.style.split.bottom.h * 100}%`,
                    }}
                  >
                    Bottom (Facecam)
                  </div>
                </div>
              )}
            </div>

            {/* Play controls + Add Clip Here */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <span className="text-xs font-mono-tabular text-slate-600">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddAtPlayhead}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Clip Here
                </button>
                <button
                  type="button"
                  onClick={() => setShowPasteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  Paste List
                </button>
              </div>
            </div>

            {/* Interactive Waveform Timeline (drag to add clip!) */}
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Timeline & Waveform (drag across waveform to add a clip)</span>
                <span className="font-mono-tabular">
                  {dragStartSec != null && dragEndSec != null
                    ? `Selection: ${formatTime(Math.min(dragStartSec, dragEndSec))} – ${formatTime(Math.max(dragStartSec, dragEndSec))}`
                    : 'Click to jump'}
                </span>
              </div>
              <div
                ref={waveformRef}
                onMouseDown={(e) => {
                  const t = getWaveformTime(e.clientX);
                  setDragStartSec(t);
                  setDragEndSec(t);
                }}
                onMouseMove={(e) => {
                  if (dragStartSec == null) return;
                  setDragEndSec(getWaveformTime(e.clientX));
                }}
                onMouseUp={() => {
                  if (dragStartSec != null && dragEndSec != null) {
                    const a = Math.min(dragStartSec, dragEndSec);
                    const b = Math.max(dragStartSec, dragEndSec);
                    if (b - a >= 2) {
                      void addClipRange(a, b);
                    } else {
                      seekTo(a);
                    }
                  }
                  setDragStartSec(null);
                  setDragEndSec(null);
                }}
                className="relative h-20 bg-slate-900 rounded-lg overflow-hidden cursor-crosshair select-none flex items-end gap-px px-1 py-2"
              >
                {/* Waveform bars */}
                {(project.waveformPeaks.length > 0
                  ? project.waveformPeaks
                  : new Array(120).fill(0.25)
                ).map((peak, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-slate-500/75 rounded-t-[1px] pointer-events-none"
                    style={{ height: `${Math.max(12, Math.round(peak * 100))}%` }}
                  />
                ))}

                {/* Existing clip markers */}
                {primaryClips.map((c) => {
                  const leftPct = (c.startTime / duration) * 100;
                  const widthPct = Math.max(1, ((c.endTime - c.startTime) / duration) * 100);
                  const active = c.id === selectedClip?.id;
                  return (
                    <div
                      key={c.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedClipId(c.id);
                        seekTo(c.startTime);
                      }}
                      className={`absolute top-0 bottom-0 border-x transition-colors cursor-pointer ${
                        active
                          ? 'bg-blue-500/35 border-blue-400'
                          : 'bg-amber-400/20 border-amber-400/70'
                      }`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`${c.title} (${formatTime(c.startTime)} - ${formatTime(c.endTime)})`}
                    />
                  );
                })}

                {/* Drag selection */}
                {dragStartSec != null && dragEndSec != null && (
                  <div
                    className="absolute top-0 bottom-0 bg-emerald-400/35 border-x border-emerald-300 pointer-events-none"
                    style={{
                      left: `${(Math.min(dragStartSec, dragEndSec) / duration) * 100}%`,
                      width: `${(Math.abs(dragEndSec - dragStartSec) / duration) * 100}%`,
                    }}
                  />
                )}

                {/* Playhead */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>

            {/* Typed Start / End Time Adder */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Start (mm:ss)</label>
                <input
                  type="text"
                  value={typedStart}
                  onChange={(e) => setTypedStart(e.target.value)}
                  placeholder="01:10"
                  className="w-full px-2.5 py-1.5 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">End (mm:ss)</label>
                <input
                  type="text"
                  value={typedEnd}
                  onChange={(e) => setTypedEnd(e.target.value)}
                  placeholder="01:40"
                  className="w-full px-2.5 py-1.5 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Title (optional)</label>
                <input
                  type="text"
                  value={typedTitle}
                  onChange={(e) => setTypedTitle(e.target.value)}
                  placeholder="Best moment"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTypedRange}
                className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 h-[32px]"
              >
                Add by Time
              </button>
            </div>
          </div>

          {/* Selected Clip Trimmer & WYSIWYG Preview */}
          {selectedClip && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              <div className="md:col-span-5">
                <ClipPreviewPlayer
                  compact
                  videoUrl={sourceVideoUrl}
                  startTime={selectedClip.startTime}
                  endTime={selectedClip.endTime}
                  hookText={selectedClip.hookText}
                  creatorName={project.creatorName}
                  transcript={project.transcript}
                  hasSpeech={project.hasSpeech}
                  style={selectedClip.styleOverride ?? project.style}
                />
              </div>
              <div className="md:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    Editing Clip #{selectedClip.orderIndex + 1}
                  </span>
                  <span className="text-xs font-mono-tabular text-slate-500">
                    {formatTime(selectedClip.startTime)} – {formatTime(selectedClip.endTime)}
                  </span>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Clip Title</label>
                  <input
                    type="text"
                    value={selectedClip.title}
                    onChange={(e) =>
                      void updateClipField(selectedClip.id, { title: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Top Hook Banner (first {project.style.hook.durationSec}s)
                  </label>
                  <input
                    type="text"
                    value={selectedClip.hookText}
                    onChange={(e) =>
                      void updateClipField(selectedClip.id, { hookText: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                {/* Trim Start / End Handles */}
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Trim Start</span>
                      <span className="font-mono-tabular">{formatTime(selectedClip.startTime)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, selectedClip.endTime - 2)}
                      step={0.2}
                      value={selectedClip.startTime}
                      onChange={(e) =>
                        void updateClipField(selectedClip.id, {
                          startTime: Number(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Trim End</span>
                      <span className="font-mono-tabular">{formatTime(selectedClip.endTime)}</span>
                    </div>
                    <input
                      type="range"
                      min={selectedClip.startTime + 2}
                      max={duration}
                      step={0.2}
                      value={selectedClip.endTime}
                      onChange={(e) =>
                        void updateClipField(selectedClip.id, {
                          endTime: Number(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Clip List + Mixed Runner-Ups + Interactive Transcript */}
        <div className="lg:col-span-5 space-y-4">
          {/* Clip Queue List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Your Clips ({primaryClips.length})
              </h3>
              <span className="text-[11px] text-slate-500">Up to 100 clips</span>
            </div>
            {primaryClips.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No clips added yet. Drag on the waveform, click &ldquo;Add Clip Here&rdquo;, or click any transcript sentence below.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {primaryClips.map((c, idx) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedClipId(c.id);
                      seekTo(c.startTime);
                    }}
                    className={`px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      selectedClip?.id === c.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {idx + 1}. {c.title}
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-500">
                        {formatTime(c.startTime)}–{formatTime(c.endTime)} ({Math.round(c.endTime - c.startTime)}s)
                        {c.sourceType === 'auto' ? ` · Score ${c.score}` : ' · Manual'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => void moveClip(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void moveClip(idx, 1)}
                        disabled={idx === primaryClips.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/clips/${c.id}/duplicate`, { method: 'POST' });
                          await onRefresh();
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700"
                        title="Duplicate clip"
                      >
                        <CopyPlus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/clips/${c.id}`, { method: 'DELETE' });
                          await onRefresh();
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="Delete clip"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5 Runner-Up Moments (Mixed Mode) */}
          {runnerUps.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  5 Runner-up Moments
                </div>
                <span className="text-[11px] text-slate-500">One-click swap in</span>
              </div>
              <div className="divide-y divide-slate-100">
                {runnerUps.map((ru) => (
                  <div key={ru.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">{ru.title}</div>
                      <div className="text-[11px] font-mono-tabular text-slate-500">
                        {formatTime(ru.startTime)}–{formatTime(ru.endTime)} · Score {ru.score}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/clips/${ru.id}/promote`, { method: 'POST' });
                        await onRefresh();
                      }}
                      className="px-2.5 py-1 rounded-md border border-slate-300 text-xs font-medium text-slate-800 hover:bg-slate-50 shrink-0"
                    >
                      Add In
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Transcript (Click to Jump / Create Clip / Edit Words) */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Transcript</h3>
                <span className="text-[11px] text-slate-500">Click sentence to jump or clip</span>
              </div>
              <input
                type="search"
                value={transcriptQuery}
                onChange={(e) => setTranscriptQuery(e.target.value)}
                placeholder="Search spoken words..."
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg"
              />
            </div>

            {filteredTranscript.length === 0 ? (
              <div className="p-5 text-xs text-slate-500 text-center">
                {project.noticeMessage || 'No transcript lines available for this video.'}
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {filteredTranscript.map((seg) => (
                  <div key={seg.id} className="px-4 py-2.5 hover:bg-slate-50 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => seekTo(seg.start)}
                        className="text-[11px] font-mono-tabular text-blue-600 hover:underline"
                      >
                        {formatTime(seg.start)} – {formatTime(seg.end)}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const len = project.targetClipLength > 0 ? project.targetClipLength : 30;
                            void addClipRange(
                              seg.start,
                              Math.min(duration, Math.max(seg.end, seg.start + len)),
                              seg.text.slice(0, 48)
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-[11px] text-slate-700 hover:bg-white"
                          title="Create clip starting at this sentence"
                        >
                          <Scissors className="w-3 h-3" />
                          Clip from here
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSegId(seg.id);
                            setEditingSegText(seg.text);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700"
                          title="Fix transcript words"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {editingSegId === seg.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          rows={2}
                          value={editingSegText}
                          onChange={(e) => setEditingSegText(e.target.value)}
                          className="w-full text-xs border border-blue-400 rounded p-2"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void saveTranscriptEdit(seg)}
                            className="px-2.5 py-1 rounded bg-blue-600 text-white text-[11px] font-medium"
                          >
                            Save Words
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSegId(null)}
                            className="px-2.5 py-1 rounded border border-slate-200 text-[11px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        onClick={() => seekTo(seg.start)}
                        className="text-xs text-slate-800 leading-relaxed cursor-pointer"
                      >
                        {seg.text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Paste Timestamp List Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Paste Timestamp List</h3>
              <p className="text-xs text-slate-500 mt-1">
                One range per line, e.g. <code className="font-mono-tabular">12:30-13:10</code> or{' '}
                <code className="font-mono-tabular">01:05:10-01:05:55 Funny moment</code>
              </p>
            </div>
            <textarea
              rows={6}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder={'00:05-00:20 Intro hook\n00:22-00:40 Big reveal'}
              className="w-full text-xs font-mono-tabular border border-slate-300 rounded-lg p-3"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handlePasteListSubmit()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
              >
                Add All Ranges
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
