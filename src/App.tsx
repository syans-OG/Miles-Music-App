import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePlayerStore } from './stores/usePlayerStore';

import { ControlBar } from './components/ControlBar';
import { VinylWidget } from './components/VinylWidget';
import { MicroBubble } from './components/MicroBubble';
import { WindowControlsBar } from './components/WindowControlsBar';
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
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setAlwaysOnTop(isAlwaysOnTop))
      .catch(() => {
        // Browser fallback
      });
  }, [isAlwaysOnTop]);

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
      className="group w-full h-full bg-transparent text-slate-100 flex flex-col p-2 relative overflow-hidden select-none"
    >
      {/* Floating Hover Window Controls (Snapping, Minimize, Close) */}
      <WindowControlsBar />
      {/* Drag & Drop Fullscreen Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-dark-900/90 backdrop-blur-md flex flex-col items-center justify-center border-4 border-dashed border-amber-400/60 transition-all animate-fade-in rounded-3xl">
          <div className="w-20 h-20 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center mb-4 shadow-2xl animate-bounce">
            <UploadCloud className="w-10 h-10" />
          </div>
          <h3 className="text-xl font-bold text-white tracking-wide">Lepaskan File MP3 / Audio Di Sini</h3>
          <p className="text-sm text-slate-400 mt-1">Lagu akan langsung ditambahkan ke koleksi CD Laci Musik Miles</p>
        </div>
      )}

      {showBackgroundResult && youtubeImportTask && (
        <div className={`absolute left-1/2 top-7 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-[4px] border border-white/12 bg-[#11141c] px-2.5 py-2 shadow-2xl ${mode === 'control-bar' ? 'w-[420px]' : mode === 'vinyl-widget' ? 'w-[184px]' : 'w-[144px]'}`} role="status">
          {youtubeImportTask.status === 'success'
            ? <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-300" />
            : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-rose-300" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-white">{youtubeImportTask.message}</p>
            {mode === 'control-bar' && youtubeImportTask.report && (
              <p className="mt-0.5 text-[9px] text-slate-500">{youtubeImportTask.report.added} masuk · {youtubeImportTask.report.duplicates} duplikat · {youtubeImportTask.report.skipped} dilewati</p>
            )}
          </div>
          {youtubeImportTask.status !== 'success' && youtubeImportTask.retryable && (
            <button type="button" onClick={() => void retryYoutubeTask()} className="flex-shrink-0 text-amber-300 hover:text-amber-200" aria-label="Coba lagi"><RotateCcw className="h-3.5 w-3.5" /></button>
          )}
          {mode === 'control-bar' && youtubeImportTask.targetPlaylistId && (
            <button type="button" onClick={() => { setDrawerOpen(true); setDrawerTab('playlist'); selectPlaylist(youtubeImportTask.targetPlaylistId ?? null); }} className="text-[9px] font-semibold text-amber-300 hover:text-amber-200">Buka</button>
          )}
          <button type="button" onClick={dismissYoutubeTask} className="flex-shrink-0 rounded-[3px] p-1 text-slate-500 hover:bg-white/10 hover:text-white" aria-label="Tutup notifikasi impor"><X className="h-3.5 w-3.5" /></button>
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
          <div className={`w-full flex flex-col ${getAlignmentClass()}`}>
            <MicroBubble />
          </div>
        )}

      </main>
    </div>
  );
};

export default App;
