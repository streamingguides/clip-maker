import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatTime } from '../shared/styles.ts';
import type {
  ClipStyleConfig,
  TranscriptSegment,
  TranscriptWord,
} from '../shared/types.ts';

interface ClipPreviewPlayerProps {
  videoUrl: string | null;
  startTime: number;
  endTime: number;
  hookText: string;
  creatorName: string;
  transcript: TranscriptSegment[];
  hasSpeech: boolean;
  style: ClipStyleConfig;
  externalTime?: number;
  onTimeUpdate?: (absTime: number) => void;
  compact?: boolean;
}

export const ClipPreviewPlayer: React.FC<ClipPreviewPlayerProps> = ({
  videoUrl,
  startTime,
  endTime,
  hookText,
  creatorName,
  transcript,
  hasSpeech,
  style,
  externalTime,
  onTimeUpdate,
  compact = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);

  const clipDur = Math.max(1, endTime - startTime);
  const relTime = Math.max(0, Math.min(clipDur, currentTime - startTime));
  const progressPct = Math.min(100, Math.max(0, (relTime / clipDur) * 100));

  useEffect(() => {
    if (externalTime != null && videoRef.current) {
      if (Math.abs(videoRef.current.currentTime - externalTime) > 0.35) {
        videoRef.current.currentTime = externalTime;
        if (bgVideoRef.current) bgVideoRef.current.currentTime = externalTime;
        setCurrentTime(externalTime);
      }
    }
  }, [externalTime]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
    if (bgVideoRef.current) {
      bgVideoRef.current.currentTime = startTime;
    }
  }, [startTime, videoUrl]);

  const clipWords = useMemo(() => {
    const out: TranscriptWord[] = [];
    for (const seg of transcript) {
      if (seg.end < startTime || seg.start > endTime) continue;
      if (seg.words.length > 0) {
        for (const w of seg.words) {
          if (w.end >= startTime && w.start <= endTime) out.push(w);
        }
      } else {
        const tokens = seg.text.split(/\s+/).filter(Boolean);
        const step = (seg.end - seg.start) / Math.max(1, tokens.length);
        tokens.forEach((tok, idx) => {
          const s = seg.start + idx * step;
          const e = s + step;
          if (e >= startTime && s <= endTime) {
            out.push({ id: `${seg.id}_${idx}`, word: tok, start: s, end: e });
          }
        });
      }
    }
    return out;
  }, [transcript, startTime, endTime]);

  const activeChunk = useMemo(() => {
    if (!style.captions.enabled || !hasSpeech || clipWords.length === 0) return null;
    const chunkSize = Math.max(1, Math.min(4, style.captions.wordsPerLine || 3));
    for (let i = 0; i < clipWords.length; i += chunkSize) {
      const group = clipWords.slice(i, i + chunkSize);
      const gStart = group[0].start;
      const gEnd = group[group.length - 1].end;
      if (currentTime >= gStart - 0.1 && currentTime <= gEnd + 0.15) {
        const activeIndex = group.findIndex(
          (w) => currentTime >= w.start - 0.05 && currentTime <= w.end + 0.08
        );
        return { group, activeIndex };
      }
    }
    return null;
  }, [clipWords, currentTime, style.captions.enabled, style.captions.wordsPerLine, hasSpeech]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < startTime || v.currentTime >= endTime) {
        v.currentTime = startTime;
      }
      void v.play();
      void bgVideoRef.current?.play();
      setPlaying(true);
    } else {
      v.pause();
      bgVideoRef.current?.pause();
      setPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime >= endTime) {
      v.currentTime = startTime;
      if (bgVideoRef.current) bgVideoRef.current.currentTime = startTime;
    }
    setCurrentTime(v.currentTime);
    onTimeUpdate?.(v.currentTime);
  };

  const ratioStyle =
    style.ratio === '9:16'
      ? 'aspect-[9/16]'
      : style.ratio === '1:1'
        ? 'aspect-square'
        : style.ratio === '4:5'
          ? 'aspect-[4/5]'
          : 'aspect-video';

  const cap = style.captions;
  const captionPosClass =
    cap.position === 'top'
      ? 'top-[14%]'
      : cap.position === 'middle'
        ? 'top-1/2 -translate-y-1/2'
        : 'bottom-[16%]';

  return (
    <div className={`flex flex-col items-center ${compact ? 'w-full' : ''}`}>
      <div
        className={`relative w-full overflow-hidden rounded-xl bg-[#0B0F19] border border-slate-800 ${ratioStyle} ${
          compact ? 'max-h-[420px]' : 'max-h-[540px]'
        } flex items-center justify-center select-none`}
        style={
          style.layout === 'solid'
            ? {
                background: `linear-gradient(180deg, ${style.solidBgColor}, ${style.solidBgGradientEnd})`,
              }
            : undefined
        }
      >
        {videoUrl ? (
          <>
            {style.layout === 'blur' && (
              <video
                ref={bgVideoRef}
                src={videoUrl}
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-65 pointer-events-none"
              />
            )}

            {style.layout === 'split' ? (
              <div className="relative w-full h-full flex flex-col">
                <div className="w-full h-1/2 overflow-hidden bg-black relative">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    muted={muted}
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setPlaying(false)}
                    className="w-full h-full object-cover"
                    style={{
                      objectPosition: `${(style.split.top.x + style.split.top.w / 2) * 100}% ${(style.split.top.y + style.split.top.h / 2) * 100}%`,
                    }}
                  />
                </div>
                <div className="w-full h-1/2 overflow-hidden bg-slate-900 border-t border-white/10 relative">
                  <video
                    src={videoUrl}
                    muted
                    playsInline
                    ref={(el) => {
                      if (el && videoRef.current) {
                        if (Math.abs(el.currentTime - videoRef.current.currentTime) > 0.3) {
                          el.currentTime = videoRef.current.currentTime;
                        }
                      }
                    }}
                    className="w-full h-full object-cover"
                    style={{
                      objectPosition: `${(style.split.bottom.x + style.split.bottom.w / 2) * 100}% ${(style.split.bottom.y + style.split.bottom.h / 2) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                src={videoUrl}
                muted={muted}
                playsInline
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setPlaying(false)}
                className={`relative z-10 w-full h-full ${
                  style.layout === 'crop' ? 'object-cover' : 'object-contain'
                }`}
              />
            )}
          </>
        ) : (
          <div className="text-slate-400 text-xs px-4 text-center">
            Video preview will load once analyzed
          </div>
        )}

        {/* Top safe-zone Hook Banner */}
        {style.hook.enabled && hookText.trim() && relTime <= (style.hook.durationSec || 4) && (
          <div className="absolute top-[8%] left-4 right-4 z-20 flex justify-center pointer-events-none">
            <div
              className="px-3.5 py-2 rounded-lg text-center font-bold shadow-lg max-w-[92%] leading-snug"
              style={{
                backgroundColor: style.hook.bgColor,
                color: style.hook.textColor,
                fontSize: compact ? '12px' : '14px',
              }}
            >
              {hookText}
            </div>
          </div>
        )}

        {/* Synchronized Word-Level Captions */}
        {activeChunk && (
          <div
            className={`absolute left-3 right-3 z-20 flex justify-center pointer-events-none ${captionPosClass}`}
            dir={cap.rtl ? 'rtl' : 'ltr'}
          >
            <div
              className="px-3 py-1 rounded-md text-center font-extrabold leading-tight flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5"
              style={{
                fontFamily: cap.rtl ? '"Noto Sans Arabic", "Noto Nastaliq Urdu", sans-serif' : cap.fontFamily,
                fontSize: `${Math.max(14, Math.round(cap.fontSize * (compact ? 0.28 : 0.34)))}px`,
                backgroundColor:
                  cap.presetId === 'boxed-highlight' ? cap.boxColor || 'rgba(15,23,42,0.85)' : 'transparent',
                textShadow:
                  cap.outlineWidth > 0
                    ? `0 2px 6px ${cap.outlineColor}, 1px 1px 0 ${cap.outlineColor}, -1px -1px 0 ${cap.outlineColor}`
                    : undefined,
              }}
            >
              {activeChunk.group.map((w, idx) => {
                const isActive = idx === activeChunk.activeIndex;
                const displayWord = cap.uppercase && !cap.rtl ? w.word.toUpperCase() : w.word;
                return (
                  <span
                    key={w.id}
                    className="inline-block transition-transform duration-75"
                    style={{
                      color: isActive ? cap.highlightColor : cap.primaryColor,
                      transform: isActive ? 'scale(1.08)' : 'scale(1)',
                    }}
                  >
                    {displayWord}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Source Credit */}
        {style.showCredit && creatorName.trim() && (
          <div className="absolute bottom-[4%] left-0 right-0 z-20 text-center pointer-events-none">
            <span className="text-[11px] font-medium text-white/80 drop-shadow">
              Source: {creatorName}
            </span>
          </div>
        )}

        {/* Bottom Progress Bar */}
        {style.showProgressBar && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-30">
            <div
              className="h-full transition-all duration-100"
              style={{
                width: `${progressPct}%`,
                backgroundColor: style.progressBarColor || '#FACC15',
              }}
            />
          </div>
        )}
      </div>

      {/* Player Controls */}
      <div className="mt-2.5 w-full flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!videoUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing ? 'Pause' : 'Play Clip'}
          </button>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
        <div className="text-xs font-mono-tabular text-slate-500">
          {formatTime(relTime)} / {formatTime(clipDur)}
        </div>
      </div>
    </div>
  );
};
