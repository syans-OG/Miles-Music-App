import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Play, Pause, Layers, Loader2, RotateCcw } from 'lucide-react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { getDisplayCoverUrl } from '../utils/coverImage';

export const MicroBubble: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    playbackIntent,
    playbackStatus,
    playbackError,
    togglePlayPause,
    cycleMode,
    dockPosition,
    prevMode,
  } = usePlayerStore(useShallow((state) => ({
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    playbackIntent: state.playbackIntent,
    playbackStatus: state.playbackStatus,
    playbackError: state.playbackError,
    togglePlayPause: state.togglePlayPause,
    cycleMode: state.cycleMode,
    dockPosition: state.dockPosition,
    prevMode: state.prevMode,
  })));
  const isPlaybackPending = playbackStatus === 'resolving' || playbackStatus === 'loading' || playbackStatus === 'buffering';

  const getAnimationClass = () => {
    const isFromMode1 = prevMode === 'control-bar';
    const prefix = isFromMode1 ? 'animate-shrink-mode3-from-mode1' : 'animate-shrink-mode3';
    switch (dockPosition) {
      case 'top-left':
      case 'bottom-left':
        return `${prefix}-left`;
      case 'top-right':
      case 'bottom-right':
        return `${prefix}-right`;
      default:
        return 'animate-shrink-mode3-center';
    }
  };

  const handleStartDrag = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return;
    }
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().startDragging();
    } catch {
      // Browser fallback
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleStartDrag}
      className={`relative group w-12 h-12 cursor-grab active:cursor-grabbing ${getAnimationClass()}`}
    >
      <div
        onClick={() => togglePlayPause()}
        title={playbackError?.message ?? (isPlaybackPending ? 'Menyiapkan audio…' : playbackIntent ? 'Pause' : 'Play')}
        className="w-full h-full animate-float rounded-full glass-panel p-1 flex items-center justify-center border border-white/20 shadow-2xl hover:scale-110 transition-transform relative overflow-hidden"
      >
        <img
          src={getDisplayCoverUrl(currentSong?.coverUrl, 96)}
          alt={currentSong?.title}
          decoding="async"
          className={`w-full h-full rounded-full object-cover ${isPlaying ? 'animate-spin-slow' : ''}`}
        />

        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {playbackError
            ? <RotateCcw className="w-5 h-5 text-white" />
            : isPlaybackPending
              ? <Loader2 className="w-5 h-5 animate-spin text-white" />
              : playbackIntent
                ? <Pause className="w-5 h-5 text-white fill-current" />
                : <Play className="w-5 h-5 text-white fill-current ml-0.5" />}
        </div>
      </div>

      {/* Mode Switcher Button Popover */}
      <button
        onClick={cycleMode}
        title="Kembali ke Mode 1 (Bar Console)"
        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white text-dark-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:scale-110"
      >
        <Layers className="w-3 h-3" />
      </button>
    </div>
  );
};
