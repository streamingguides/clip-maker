import React, { useState } from 'react';
import { CAPTION_PRESETS, applyPresetToStyle } from '../shared/styles.ts';
import type {
  AspectRatio,
  CaptionPosition,
  ClipStyleConfig,
  LayoutMode,
} from '../shared/types.ts';

interface StyleCustomizerProps {
  style: ClipStyleConfig;
  creatorName: string;
  onChangeStyle: (next: ClipStyleConfig) => void;
  onChangeCreator?: (name: string) => void;
}

export const StyleCustomizer: React.FC<StyleCustomizerProps> = ({
  style,
  creatorName,
  onChangeStyle,
  onChangeCreator,
}) => {
  const [tab, setTab] = useState<'captions' | 'layout' | 'audio'>('captions');

  const updateCaptions = (patch: Partial<ClipStyleConfig['captions']>) => {
    onChangeStyle({
      ...style,
      captions: { ...style.captions, ...patch },
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Clip Style & Sound</h3>
          <p className="text-xs text-slate-500">Captions, framing, hook box, and clean voice</p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['captions', 'layout', 'audio'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 capitalize ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'audio' ? 'Voice & Hook' : t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'captions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-slate-700">Burn-in Captions</label>
            <input
              type="checkbox"
              checked={style.captions.enabled}
              onChange={(e) => updateCaptions({ enabled: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CAPTION_PRESETS.map((preset) => {
              const active = style.captions.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onChangeStyle(applyPresetToStyle(style, preset.id))}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    active
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 truncate">
                      {preset.name}
                    </span>
                    <span
                      className="w-3 h-3 rounded-sm shrink-0 border border-slate-300"
                      style={{ backgroundColor: preset.config.highlightColor }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{preset.hint}</p>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Font</label>
              <select
                value={style.captions.fontFamily}
                onChange={(e) => updateCaptions({ fontFamily: e.target.value })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="Montserrat">Montserrat Bold</option>
                <option value="Anton">Anton Impact</option>
                <option value="Noto Sans">Noto Sans Clean</option>
                <option value="Noto Sans Arabic">Urdu / Arabic (Noto)</option>
                <option value="Noto Nastaliq Urdu">Urdu Nastaliq</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">
                Size ({style.captions.fontSize}px)
              </label>
              <input
                type="range"
                min={36}
                max={88}
                value={style.captions.fontSize}
                onChange={(e) => updateCaptions({ fontSize: Number(e.target.value) })}
                className="w-full accent-blue-600 mt-1.5"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">Words per line</label>
              <select
                value={style.captions.wordsPerLine}
                onChange={(e) => updateCaptions({ wordsPerLine: Number(e.target.value) })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value={1}>1 word</option>
                <option value={2}>2 words</option>
                <option value={3}>3 words</option>
                <option value={4}>4 words</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-600 mb-1">Position (Safe Zone)</label>
              <select
                value={style.captions.position}
                onChange={(e) => updateCaptions({ position: e.target.value as CaptionPosition })}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white"
              >
                <option value="bottom">Bottom Safe</option>
                <option value="middle">Middle</option>
                <option value="top">Top Safe</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex items-center justify-between text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
              <span>Text Color</span>
              <input
                type="color"
                value={style.captions.primaryColor}
                onChange={(e) => updateCaptions({ primaryColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
              <span>Highlight</span>
              <input
                type="color"
                value={style.captions.highlightColor}
                onChange={(e) => updateCaptions({ highlightColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0"
              />
            </label>
            <label className="flex items-center justify-between text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
              <span>Outline</span>
              <input
                type="color"
                value={style.captions.outlineColor}
                onChange={(e) => updateCaptions({ outlineColor: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border-0"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={style.captions.uppercase}
                onChange={(e) => updateCaptions({ uppercase: e.target.checked })}
                className="accent-blue-600"
              />
              Uppercase
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={style.captions.autoEmoji}
                onChange={(e) => updateCaptions({ autoEmoji: e.target.checked })}
                className="accent-blue-600"
              />
              Auto-Emoji
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={style.captions.maskProfanity}
                onChange={(e) => updateCaptions({ maskProfanity: e.target.checked })}
                className="accent-blue-600"
              />
              Mask bad words
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={style.captions.rtl}
                onChange={(e) => updateCaptions({ rtl: e.target.checked })}
                className="accent-blue-600"
              />
              RTL (Urdu / Arabic)
            </label>
          </div>
        </div>
      )}

      {tab === 'layout' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Video Ratio</label>
            <div className="grid grid-cols-4 gap-2">
              {(['9:16', '1:1', '4:5', '16:9'] as AspectRatio[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onChangeStyle({ ...style, ratio: r })}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    style.ratio === r
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">Frame Layout</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'blur', label: 'Blur Background', hint: 'Centered video + soft blur' },
                  { id: 'crop', label: 'Smart Face Crop', hint: 'Fills full screen cleanly' },
                  { id: 'split', label: 'Split Screen', hint: 'Gameplay top + facecam bottom' },
                  { id: 'solid', label: 'Solid Color Bars', hint: 'Clean dark/gradient bars' },
                ] as Array<{ id: LayoutMode; label: string; hint: string }>
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeStyle({ ...style, layout: item.id })}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    style.layout === item.id
                      ? 'border-blue-600 bg-blue-50/60'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-900">{item.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {style.layout === 'solid' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center justify-between text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
                <span>Top Color</span>
                <input
                  type="color"
                  value={style.solidBgColor}
                  onChange={(e) => onChangeStyle({ ...style, solidBgColor: e.target.value })}
                  className="w-6 h-6"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
                <span>Bottom Color</span>
                <input
                  type="color"
                  value={style.solidBgGradientEnd}
                  onChange={(e) =>
                    onChangeStyle({ ...style, solidBgGradientEnd: e.target.value })
                  }
                  className="w-6 h-6"
                />
              </label>
            </div>
          )}

          {style.layout === 'split' && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="font-medium text-slate-800">Split Screen Crop Areas</div>
              <p className="text-slate-500">
                Adjust Top (Gameplay) and Bottom (Facecam) focus areas, or mark them visually in
                the Manual Editor.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Top Y ({Math.round(style.split.top.y * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={Math.round(style.split.top.y * 100)}
                    onChange={(e) =>
                      onChangeStyle({
                        ...style,
                        split: {
                          ...style.split,
                          top: { ...style.split.top, y: Number(e.target.value) / 100 },
                        },
                      })
                    }
                    className="w-full accent-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">
                    Bottom X ({Math.round(style.split.bottom.x * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={Math.round(style.split.bottom.x * 100)}
                    onChange={(e) =>
                      onChangeStyle({
                        ...style,
                        split: {
                          ...style.split,
                          bottom: { ...style.split.bottom, x: Number(e.target.value) / 100 },
                        },
                      })
                    }
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'audio' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-900">Voice Perfect (-14 LUFS)</div>
                <div className="text-[11px] text-slate-500">
                  Makes speech loud & clear for phone speakers
                </div>
              </div>
              <input
                type="checkbox"
                checked={style.audio.normalizeLoudness}
                onChange={(e) =>
                  onChangeStyle({
                    ...style,
                    audio: { ...style.audio, normalizeLoudness: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-900">Clean Voice & Noise Filter</div>
                <div className="text-[11px] text-slate-500">
                  Removes low rumble and evens out quiet/loud speech
                </div>
              </div>
              <input
                type="checkbox"
                checked={style.audio.cleanVoice}
                onChange={(e) =>
                  onChangeStyle({
                    ...style,
                    audio: { ...style.audio, cleanVoice: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-slate-900">Trim Long Silences</div>
                <div className="text-[11px] text-slate-500">
                  Automatically cuts awkward pauses longer than 0.7s
                </div>
              </div>
              <input
                type="checkbox"
                checked={style.audio.trimSilences}
                onChange={(e) =>
                  onChangeStyle({
                    ...style,
                    audio: { ...style.audio, trimSilences: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
              <span>Show Top Hook Box (first {style.hook.durationSec}s)</span>
              <input
                type="checkbox"
                checked={style.hook.enabled}
                onChange={(e) =>
                  onChangeStyle({
                    ...style,
                    hook: { ...style.hook, enabled: e.target.checked },
                  })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
              <span>Show &ldquo;Source: Creator&rdquo; Credit</span>
              <input
                type="checkbox"
                checked={style.showCredit}
                onChange={(e) =>
                  onChangeStyle({ ...style, showCredit: e.target.checked })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            {style.showCredit && onChangeCreator && (
              <div>
                <label className="block text-xs text-slate-600 mb-1">Creator Credit Name</label>
                <input
                  type="text"
                  value={creatorName}
                  onChange={(e) => onChangeCreator(e.target.value)}
                  placeholder="Creator or channel name"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2"
                />
              </div>
            )}

            <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
              <span>Show Bottom Progress Bar</span>
              <input
                type="checkbox"
                checked={style.showProgressBar}
                onChange={(e) =>
                  onChangeStyle({ ...style, showProgressBar: e.target.checked })
                }
                className="w-4 h-4 accent-blue-600"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
