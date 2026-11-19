import { useCallback, useEffect, useState } from 'react';
import { ManualEditorScreen } from './components/ManualEditorScreen.tsx';
import { ProgressScreen } from './components/ProgressScreen.tsx';
import { ResultsScreen } from './components/ResultsScreen.tsx';
import { SettingsScreen } from './components/SettingsScreen.tsx';
import { StartScreen } from './components/StartScreen.tsx';
import { DEFAULT_STYLE } from './shared/styles.ts';
import type {
  AppSettings,
  ClipItem,
  ProjectRecord,
  SystemHealth,
} from './shared/types.ts';

type ViewScreen = 'start' | 'progress' | 'editor' | 'results' | 'settings';

export default function App() {
  const [screen, setScreen] = useState<ViewScreen>('start');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [recentProjects, setRecentProjects] = useState<
    Array<ProjectRecord & { clipCount: number; completedCount: number }>
  >([]);

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectRecord | null>(null);
  const [activeClips, setActiveClips] = useState<ClipItem[]>([]);

  const loadBootstrap = useCallback(async () => {
    const [setRes, healthRes, projRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/health'),
      fetch('/api/projects'),
    ]);
    if (setRes.ok) setSettings((await setRes.json()) as AppSettings);
    if (healthRes.ok) setHealth((await healthRes.json()) as SystemHealth);
    if (projRes.ok) {
      setRecentProjects(
        (await projRes.json()) as Array<
          ProjectRecord & { clipCount: number; completedCount: number }
        >
      );
    }
  }, []);

  const refreshActiveProject = useCallback(async (id?: string) => {
    const targetId = id ?? activeProjectId;
    if (!targetId) return;
    const res = await fetch(`/api/projects/${targetId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      project: ProjectRecord;
      clips: ClipItem[];
    };
    setActiveProject(data.project);
    setActiveClips(data.clips);
  }, [activeProjectId]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  // Subscribe to SSE updates for active project
  useEffect(() => {
    if (!activeProjectId) return;
    const es = new EventSource(`/api/projects/${activeProjectId}/events`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          project?: ProjectRecord;
          clips?: ClipItem[];
        };
        if (data.project) {
          setActiveProject(data.project);
          if (data.clips) setActiveClips(data.clips);

          // Auto-route cleanly when analysis finishes
          setScreen((prev) => {
            if (prev !== 'progress') return prev;
            if (data.project?.stage === 'ready') {
              return data.project.mode === 'manual' || data.project.mode === 'mixed'
                ? 'editor'
                : 'results';
            }
            if (data.project?.stage === 'completed') {
              return 'results';
            }
            return prev;
          });
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => es.close();
  }, [activeProjectId]);

  const handleOpenProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { project: ProjectRecord; clips: ClipItem[] };
    setActiveProject(data.project);
    setActiveClips(data.clips);

    const p = data.project;
    if (
      p.stage === 'downloading' ||
      p.stage === 'probing' ||
      p.stage === 'transcribing' ||
      p.stage === 'analyzing' ||
      p.stage === 'rendering' ||
      p.stage === 'paused' ||
      p.stage === 'error'
    ) {
      setScreen('progress');
    } else if (p.stage === 'completed') {
      setScreen('results');
    } else {
      setScreen(p.mode === 'manual' || p.mode === 'mixed' ? 'editor' : 'results');
    }
  };

  const completedCount = activeClips.filter(
    (c) => !c.isRunnerUp && c.status === 'completed'
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 sm:px-8 h-14 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => {
            void loadBootstrap();
            setScreen('start');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
        >
          Clip Maker
        </button>

        {/* Zone 2: Clean single-line text nav links */}
        <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              void loadBootstrap();
              setScreen('start');
            }}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              screen === 'start'
                ? 'border-blue-600 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            New Project
          </button>

          {activeProject && (
            <>
              <button
                type="button"
                onClick={() => setScreen('progress')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  screen === 'progress'
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Progress
              </button>
              <button
                type="button"
                onClick={() => setScreen('editor')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  screen === 'editor'
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Manual Editor
              </button>
              <button
                type="button"
                onClick={() => setScreen('results')}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  screen === 'results'
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Results
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
              screen === 'settings'
                ? 'border-blue-600 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Settings
          </button>
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="shrink-0 hidden sm:flex items-center">
          {activeProject && completedCount > 0 ? (
            <a
              href={`/api/projects/${activeProject.id}/download-zip`}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              Export ZIP ({completedCount})
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setScreen('start')}
              className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              Start Clipping
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {screen === 'start' && (
          <StartScreen
            defaultStyle={settings?.defaultStyle ?? DEFAULT_STYLE}
            defaultCreatorName={settings?.defaultCreatorName ?? ''}
            recentProjects={recentProjects}
            onProjectCreated={(id) => {
              setActiveProjectId(id);
              void refreshActiveProject(id);
              setScreen('progress');
            }}
            onOpenProject={(id) => void handleOpenProject(id)}
            onDeleteProject={async (id) => {
              await fetch(`/api/projects/${id}`, { method: 'DELETE' });
              if (activeProjectId === id) {
                setActiveProjectId(null);
                setActiveProject(null);
                setActiveClips([]);
              }
              await loadBootstrap();
            }}
          />
        )}

        {screen === 'progress' && activeProject && (
          <ProgressScreen
            project={activeProject}
            clips={activeClips}
            onPause={() => {
              void fetch(`/api/projects/${activeProject.id}/pause`, { method: 'POST' });
            }}
            onResume={() => {
              void fetch(`/api/projects/${activeProject.id}/resume`, { method: 'POST' });
            }}
            onCancel={() => {
              void fetch(`/api/projects/${activeProject.id}/cancel`, { method: 'POST' });
            }}
            onGoToResults={() => setScreen('results')}
            onGoToEditor={() => setScreen('editor')}
            onBackToStart={() => {
              void loadBootstrap();
              setScreen('start');
            }}
          />
        )}

        {screen === 'editor' && activeProject && (
          <ManualEditorScreen
            project={activeProject}
            clips={activeClips}
            onRefresh={() => refreshActiveProject(activeProject.id)}
            onStartRender={async (allRatios) => {
              await fetch(`/api/projects/${activeProject.id}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allRatios }),
              });
              setScreen('progress');
            }}
          />
        )}

        {screen === 'results' && activeProject && (
          <ResultsScreen
            project={activeProject}
            clips={activeClips}
            onRefresh={() => refreshActiveProject(activeProject.id)}
            onOpenEditor={() => setScreen('editor')}
          />
        )}

        {screen === 'settings' && settings && (
          <SettingsScreen
            settings={settings}
            health={health}
            onSave={async (next) => {
              const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(next),
              });
              if (res.ok) setSettings((await res.json()) as AppSettings);
            }}
          />
        )}
      </main>
    </div>
  );
}
