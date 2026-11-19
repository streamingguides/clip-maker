import React, { useState } from 'react';
import { Check, Copy, Smartphone } from 'lucide-react';
import { StyleCustomizer } from './StyleCustomizer.tsx';
import type { AppSettings, SystemHealth } from '../shared/types.ts';

interface SettingsScreenProps {
  settings: AppSettings;
  health: SystemHealth | null;
  onSave: (next: AppSettings) => Promise<void>;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  health,
  onSave,
}) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const phoneUrl = health ? `http://${health.localIp}:${health.port}` : 'http://localhost:3000';

  const handleSave = async () => {
    await onSave(draft);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Default caption style, local speech model, speed, and Wi-Fi phone access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
        >
          {savedNotice ? 'Settings Saved' : 'Save Settings'}
        </button>
      </div>

      {/* Same Wi-Fi Phone Access */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-slate-900">Open on your phone (same Wi-Fi)</div>
            <p className="text-xs text-slate-500 mt-0.5">
              Type this address in your phone browser while connected to the same Wi-Fi network:
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <code className="px-3 py-2 rounded-lg bg-slate-100 text-xs font-mono-tabular text-slate-900">
            {phoneUrl}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(phoneUrl);
              setCopiedUrl(true);
              setTimeout(() => setCopiedUrl(false), 1800);
            }}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-medium hover:bg-slate-50"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedUrl ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* General & Performance Settings */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="block text-xs font-semibold text-slate-900 mb-1">
            Default Creator Credit Name
          </label>
          <input
            type="text"
            value={draft.defaultCreatorName}
            onChange={(e) => setDraft({ ...draft, defaultCreatorName: e.target.value })}
            placeholder="Optional fallback (uses video channel name if empty)"
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-900 mb-1">
            Speech Caption Model (faster-whisper)
          </label>
          <select
            value={draft.whisperModel}
            onChange={(e) =>
              setDraft({
                ...draft,
                whisperModel: e.target.value as AppSettings['whisperModel'],
              })
            }
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="tiny">Tiny (Fastest, English)</option>
            <option value="base">Base (Fast, light CPU)</option>
            <option value="small">Small (Recommended for Urdu / Hindi / Arabic / Mix)</option>
            <option value="medium">Medium (High accuracy, slower on CPU)</option>
            <option value="large-v3">Large-v3 (Best accuracy, GPU recommended)</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-900 mb-1">
            Clips Rendered at Once ({draft.parallelRenders})
          </label>
          <input
            type="range"
            min={1}
            max={4}
            value={draft.parallelRenders}
            onChange={(e) =>
              setDraft({ ...draft, parallelRenders: Number(e.target.value) })
            }
            className="w-full accent-blue-600 mt-1.5"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Keep at 2 so normal computers stay smooth during 100-clip batches.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-900 mb-1">
            Browser Cookies for Blocked Links
          </label>
          <select
            value={draft.cookiesBrowser}
            onChange={(e) =>
              setDraft({
                ...draft,
                cookiesBrowser: e.target.value as AppSettings['cookiesBrowser'],
              })
            }
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="none">Automatic (try normal first, then Chrome/Edge/Firefox)</option>
            <option value="chrome">Google Chrome</option>
            <option value="edge">Microsoft Edge</option>
            <option value="firefox">Mozilla Firefox</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-900 mb-1">
            Keep Temp Files (Days)
          </label>
          <input
            type="number"
            min={1}
            max={365}
            value={draft.keepOutputsDays}
            onChange={(e) =>
              setDraft({ ...draft, keepOutputsDays: Number(e.target.value) || 14 })
            }
            className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-900 mb-1">
            Output Folder
          </label>
          <input
            type="text"
            readOnly
            value={draft.outputFolder}
            className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 text-slate-600 border border-slate-200 rounded-lg"
          />
        </div>

        <label className="md:col-span-2 flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer">
          <div>
            <div className="text-xs font-semibold text-slate-900">
              Use Free Local Ollama (if running on this PC)
            </div>
            <div className="text-[11px] text-slate-500">
              Polishes clip titles and hooks offline via http://localhost:11434. Works completely without it.
            </div>
          </div>
          <input
            type="checkbox"
            checked={draft.useOllamaIfRunning}
            onChange={(e) =>
              setDraft({ ...draft, useOllamaIfRunning: e.target.checked })
            }
            className="w-4 h-4 accent-blue-600"
          />
        </label>
      </div>

      {/* Default Style */}
      <StyleCustomizer
        style={draft.defaultStyle}
        creatorName={draft.defaultCreatorName}
        onChangeStyle={(s) => setDraft({ ...draft, defaultStyle: s })}
        onChangeCreator={(name) => setDraft({ ...draft, defaultCreatorName: name })}
      />

      {/* Local Tools Check */}
      {health && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Free Local Tools on This Machine</h3>
            <span className="text-xs font-mono-tabular text-slate-500">
              {health.diskFreeGb} GB disk free · Encoder: {health.hardwareEncoder}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {[
              { name: 'FFmpeg & libass', ok: health.ffmpeg },
              { name: 'yt-dlp Downloader', ok: health.ytDlp },
              { name: 'faster-whisper Speech', ok: health.fasterWhisper },
              { name: 'OpenCV Face Crop', ok: health.openCv },
              { name: 'YAMNet Audio Events', ok: health.yamnet },
              { name: 'Local Ollama', ok: health.ollama },
            ].map((tool) => (
              <div
                key={tool.name}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200"
              >
                <span className="text-slate-700">{tool.name}</span>
                <span className={tool.ok ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                  {tool.ok ? 'Ready' : 'Optional'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
