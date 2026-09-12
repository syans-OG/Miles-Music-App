import React, { lazy, Suspense, useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from './stores/usePlayerStore';
import { applyTheme, useThemeStore } from './stores/useThemeStore';
import { syncDiscordActivity } from './services/discordRpcService';

import { ControlBar } from './components/ControlBar';
import { VinylWidget } from './components/VinylWidget';
import { MicroBubble } from './components/MicroBubble';
import { WindowControlsBar } from './components/WindowControlsBar';
import { isTauri } from './utils/tauriEnv';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { AlertTriangle, Check, RotateCcw, UploadCloud, X } from 'lucide-react';
import { useWindowResizer } from './hooks/useWindowResizer';

const MusicDrawer = lazy(() => import('./components/MusicDrawer').then((module) => ({
  default: module.MusicDrawer,
})));

export const App: React.FC = () => {
  const { mode, addMultipleLocalSongs, dockPosition, isAlwaysOnTop, isDrawerOpen, youtubeImportTask, dismissYoutubeTask, retryYoutubeTask, setDrawerOpen, setDrawerTab, selectPlaylist } = usePlayerStore(useShallow((state) => ({
    mode: state.mode,
    addMultipleLocalSongs: state.addMultipleLocalSongs,
    dockPosition: state.dockPosition,
    isAlwaysOnTop: state.isAlwaysOnTop,
    isDrawerOpen: state.isDrawerOpen,
    youtubeImportTask: state.youtubeImportTask,
    dismissYoutubeTask: state.dismissYoutubeTask,
    retryYoutubeTask: state.retryYoutubeTask,
    setDrawerOpen: state.setDrawerOpen,
    setDrawerTab: state.setDrawerTab,
    selectPlaylist: state.selectPlaylist,
  })));
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const showBackgroundResult = Boolean(
    youtubeImportTask?.backgrounded
    && ['success', 'error', 'cancelled'].includes(youtubeImportTask.status),
  );

  // Hook to automatically resize Tauri OS Window frame to match current mode dimensions
  useWindowResizer();

  useEffect(() => {
    const { mode, colorId, custom, floating } = useThemeStore.getState();
    applyTheme(mode, colorId, custom, floating);
  }, []);

  useEffect(() => {
    void syncDiscordActivity();
    const unsub = usePlayerStore.subscribe(
      (state) => ({
        songId: state.currentSong?.id,
        title: state.currentSong?.title,
        artist: state.currentSong?.artist,
        coverUrl: state.currentSong?.coverUrl,
        isPlaying: state.isPlaying,
        duration: Math.floor(state.duration),
        enableDiscordRpc: state.enableDiscordRpc,
        discordClientId: state.discordClientId,
      }),
      () => {
        void syncDiscordActivity();
      },
      { equalityFn: shallow },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    try {
      void getCurrentWindow()
        .setAlwaysOnTop(isAlwaysOnTop)
        .catch((error) => {
          console.error('[App] setAlwaysOnTop failed:', error);
          usePlayerStore.getState().setLibraryNotice('Failed to apply always-on-top window setting.');
        });
    } catch (error) {
      console.error('[App] setAlwaysOnTop threw:', error);
      usePlayerStore.getState().setLibraryNotice('Failed to apply always-on-top window setting.');
    }
  }, [isAlwaysOnTop]);

  const [isFocusNudged, setIsFocusNudged] = useState(false);

  // System Tray & Single Instance IPC listeners
  useEffect(() => {
    let isMounted = true;
    const unlisteners: Array<() => void> = [];
    let lastTrayActionTime = 0;

    const throttleTrayAction = (fn: () => void, ms = 200) => {
      const now = Date.now();
      if (now - lastTrayActionTime < ms) return;
      lastTrayActionTime = now;
      fn();
    };

    const setupTrayListeners = async () => {
      try {
        if (!isMounted) return;

        const handlePlayPause = () => {
          throttleTrayAction(() => {
            usePlayerStore.getState().togglePlayPause();
          });
        };
        const handleNext = () => {
          throttleTrayAction(() => {
            usePlayerStore.getState().playNext('manual');
          });
        };
        const handlePrev = () => {
          throttleTrayAction(() => {
            usePlayerStore.getState().playPrev('manual');
          });
        };
        const handleSetMode = (event: { payload: number }) => {
          const m = event.payload;
          if (m === 1) usePlayerStore.getState().setMode('control-bar');
          else if (m === 2) usePlayerStore.getState().setMode('vinyl-widget');
          else if (m === 3) usePlayerStore.getState().setMode('micro-bubble');
        };
        const handleToggleLoop = () => {
          throttleTrayAction(() => {
            usePlayerStore.getState().toggleLoop();
          });
        };
        const handleShuffleQueue = () => {
          throttleTrayAction(() => {
            usePlayerStore.getState().shufflePlaybackQueue();
          });
        };
        const handleClearQueue = () => {
          throttleTrayAction(() => {
            usePlayerStore.getState().clearPlaybackQueue();
          });
        };
        const handleFocusNudge = () => {
          setIsFocusNudged(true);
          setTimeout(() => setIsFocusNudged(false), 800);
        };

        const u1 = await listen('tray-play-pause', handlePlayPause);
        const u2 = await listen('tray-next-track', handleNext);
        const u3 = await listen('tray-prev-track', handlePrev);
        const u4 = await listen<number>('tray-set-mode', handleSetMode);
        const u5 = await listen('tray-toggle-loop', handleToggleLoop);
        const u6 = await listen('tray-shuffle-queue', handleShuffleQueue);
        const u7 = await listen('tray-clear-queue', handleClearQueue);
        const u8 = await listen('single-instance-focus', handleFocusNudge);

        if (!isMounted) {
          u1();
          u2();
          u3();
          u4();
          u5();
          u6();
          u7();
          u8();
          return;
        }

        unlisteners.push(u1, u2, u3, u4, u5, u6, u7, u8);
      } catch (error) {
        if (isTauri()) console.error('[App] tray/single-instance listeners setup failed:', error);
      }
    };

    void setupTrayListeners();

    return () => {
      isMounted = false;
      unlisteners.forEach((unsub) => unsub());
    };
  }, []);

  // Pause GPU animations & release rendering overhead when app is hidden to System Tray
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        document.body.classList.add('is-app-hidden');
      } else {
        document.body.classList.remove('is-app-hidden');
      }
    };

    handleVisibility();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addMultipleLocalSongs(e.dataTransfer.files);
    }
  };

  const getAlignmentClass = () => {
    if (dockPosition === 'top-left' || dockPosition === 'bottom-left') {
      return 'items-start';
    }
    if (dockPosition === 'top-right' || dockPosition === 'bottom-right') {
      return 'items-end';
    }
    return 'items-center';
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group w-full h-full bg-transparent text-slate-100 flex flex-col p-1 relative overflow-hidden select-none transition-transform duration-300 ${isFocusNudged ? 'scale-[1.03]' : 'scale-100'}`}
    >
      {/* Floating Hover Window Controls (Snapping, Minimize, Close) */}
      <WindowControlsBar />
      {/* Drag & Drop Fullscreen Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--th-surface)_90%,transparent)] backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-amber-400/60 transition-all animate-fade-in rounded-3xl">
          <div className="w-20 h-20 rounded-full bg-th-accent-soft text-th-accent flex items-center justify-center mb-4 shadow-2xl animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-th-primary tracking-wide">Drop MP3 / Audio Files Here</h3>
          <p className="text-sm text-slate-400 mt-1">Songs will be added instantly to the Miles Music Drawer CD collection</p>
        </div>
      )}

      {showBackgroundResult && youtubeImportTask && (
        <div className={`absolute left-1/2 top-7 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-[4px] border border-th-line bg-th-surface px-2.5 py-2 shadow-2xl ${mode === 'control-bar' ? 'w-[420px]' : mode === 'vinyl-widget' ? 'w-[184px]' : 'w-[144px]'}`} role="status">
          {youtubeImportTask.status === 'success'
            ? <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-300" />
            : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-rose-300" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-th-primary">{youtubeImportTask.message}</p>
            {mode === 'control-bar' && youtubeImportTask.report && (
              <p className="mt-0.5 text-[9px] text-slate-500">{youtubeImportTask.report.added} added · {youtubeImportTask.report.duplicates} duplicates · {youtubeImportTask.report.skipped} skipped</p>
            )}
          </div>
          {youtubeImportTask.status !== 'success' && youtubeImportTask.retryable && (
            <button type="button" onClick={() => void retryYoutubeTask()} className="flex-shrink-0 text-th-accent hover:opacity-80" aria-label="Retry"><RotateCcw className="h-3.5 w-3.5" /></button>
          )}
          {mode === 'control-bar' && youtubeImportTask.targetPlaylistId && (
            <button type="button" onClick={() => { setDrawerOpen(true); setDrawerTab('playlist'); selectPlaylist(youtubeImportTask.targetPlaylistId ?? null); }} className="text-[9px] font-semibold text-th-accent hover:opacity-80">Open</button>
          )}
          <button type="button" onClick={dismissYoutubeTask} className="flex-shrink-0 rounded-[3px] p-1 text-slate-500 hover:bg-th-soft-strong hover:text-th-primary" aria-label="Close import notification"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* Main Content Area depending on Mode */}
      <main className={`z-10 flex flex-col justify-start w-full h-full ${getAlignmentClass()}`}>

        {/* MODE 1: DEFAULT CONTROL BAR & LACI MUSIK */}
        {mode === 'control-bar' && (
          <div className="w-full flex flex-col items-center">
            <ControlBar />
            {isDrawerOpen && (
              <Suspense fallback={null}>
                <MusicDrawer />
              </Suspense>
            )}
          </div>
        )}

        {/* MODE 2: MINI VINYL TURNTABLE WIDGET */}
        {mode === 'vinyl-widget' && (
          <div className={`w-full flex flex-col ${getAlignmentClass()}`}>
            <VinylWidget />
          </div>
        )}

        {/* MODE 3: MICRO FLOATING BUBBLE */}
        {mode === 'micro-bubble' && (
          <div className="w-full h-full flex items-center justify-center">
            <MicroBubble />
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
