import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Disc,
  Repeat,
  Layers,
  Loader2,
  RotateCcw
} from 'lucide-react';

import { usePlayerStore } from '../stores/usePlayerStore';

import { handleMagneticSnapOnRelease } from '../hooks/useWindowResizer';
import { getDisplayCoverUrl } from '../utils/coverImage';

export const VinylWidget: React.FC = () => {
  const {
    currentSong,
    isPlaying,
    playbackIntent,
    playbackStatus,
    playbackError,
    togglePlayPause,
    isLooping,
    toggleLoop,
    playNext,
    playPrev,
    cycleMode,
    dockPosition,
    prevMode,
    setDockPosition
  } = usePlayerStore(useShallow((state) => ({
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    playbackIntent: state.playbackIntent,
    playbackStatus: state.playbackStatus,
    playbackError: state.playbackError,
    togglePlayPause: state.togglePlayPause,
    isLooping: state.isLooping,
    toggleLoop: state.toggleLoop,
    playNext: state.playNext,
    playPrev: state.playPrev,
    cycleMode: state.cycleMode,
    dockPosition: state.dockPosition,
    prevMode: state.prevMode,
    setDockPosition: state.setDockPosition,
  })));
  const isPlaybackPending = playbackStatus === 'resolving' || playbackStatus === 'loading' || playbackStatus === 'buffering';

  const getAnimationClass = () => {
    const isFromMode3 = prevMode === 'micro-bubble';
    const prefix = isFromMode3 ? 'animate-expand-mode2-from-mode3' : 'animate-shrink-mode2';
    switch (dockPosition) {
      case 'top-left':
      case 'bottom-left':
        return `${prefix}-left`;
      case 'top-right':
      case 'bottom-right':
        return `${prefix}-right`;
      default:
        return `${prefix}-center`;
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
      const win = getCurrentWindow();
      await win.startDragging();
      setTimeout(() => {
        handleMagneticSnapOnRelease(setDockPosition);
      }, 300);
    } catch {
      // Browser fallback
    }
  };

  return (
    <div className="relative group cursor-pointer p-2">
      {/* Original Square Turntable Body (176px x 176px, matching height of Mode 1) */}
      <div
        className={`mode-two-no-outer-shadow turntable-body w-[176px] h-[176px] p-3 flex flex-col items-center justify-center relative overflow-hidden ${getAnimationClass()}`}
      >
        {/* Dedicated Top Header Drag Strip */}
        <div
          data-tauri-drag-region
          onMouseDown={handleStartDrag}
          className="absolute top-0 left-0 right-0 h-7 z-25 cursor-grab active:cursor-grabbing"
          title="Geser Vinyl Widget"
        />


        {/* Top-Left Branding / Logo */}
        <div className="absolute top-2.5 left-3 text-[9px] font-bold text-slate-400 tracking-wider flex items-center gap-1.5 z-20">
          <Disc className="w-3 h-3 text-slate-300" />
          <span>MILES</span>
        </div>


        {/* Top-Right Tonearm Pivot System */}
        <div className="absolute top-2.5 right-3 flex flex-col items-center z-20">
          <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-slate-600 to-slate-400 border border-slate-300 shadow-md" />
          {/* Metallic Tonearm Needle Rod */}
          <div
            className={`w-0.5 h-20 bg-gradient-to-b from-slate-400 to-slate-200 origin-top transition-transform duration-700 z-10 shadow-lg ${
              isPlaying ? 'rotate-[22deg]' : 'rotate-[0deg]'
            }`}
            style={{ borderRadius: '2px' }}
          >
            <div className="w-2 h-3 bg-slate-700 border border-slate-400 absolute -bottom-1 -left-0.75 rounded-sm" />
          </div>
        </div>

        {/* Center Spinning Vinyl Record Disc */}
        <div className="relative w-32 h-32 rounded-full vinyl-grooves shadow-2xl flex items-center justify-center border-2 border-neutral-800 my-auto">
          {/* Vinyl Shine Reflex */}
          <div className={`absolute inset-0 rounded-full vinyl-shine ${isPlaying ? 'animate-spin-slow' : ''}`} />

          {/* Center Album Art Badge */}
          <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 border-neutral-900 shadow-inner ${
            isPlaying ? 'animate-spin-slow' : ''
          }`}>
            <img
              src={getDisplayCoverUrl(currentSong?.coverUrl, 128)}
              alt={currentSong?.title}
              decoding="async"
              className="w-full h-full object-cover"
            />
            {/* Center Spindle Hole */}
            <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-neutral-950 border border-slate-400/50 shadow-inner" />
          </div>
        </div>

        {/* Bottom Switch Power Indicator Light */}
        <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 z-20">
          <div className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse' : 'bg-rose-500/80'}`} />
          <span className="text-[9px] text-slate-400 font-mono tracking-widest uppercase">
            {isPlaying ? 'ON' : 'OFF'}
          </span>
        </div>

        {/* Bottom-Right Mode Switcher Button */}
        <button
          onClick={cycleMode}
          className="absolute bottom-2.5 right-2.5 p-1 rounded-lg bg-white/5 hover:bg-white/20 text-slate-300 hover:text-white border border-white/10 shadow-md transition-all z-20"
          title="Pindah ke Mode Berikutnya"
        >
          <Layers className="w-3 h-3" />
        </button>

        {/* HOVER OVERLAY CONTROLS - Original Interactive Hi-Fi Overlay */}
        <div className="absolute inset-0 bg-dark-900/95 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-between p-3 z-30">

          {/* Top Track Info */}
          <div className="text-center w-full pt-0.5">
            <h5 className="text-xs font-bold text-white truncate max-w-[140px] mx-auto">
              {currentSong?.title}
            </h5>
            <p className="text-[10px] text-slate-400 truncate max-w-[130px] mx-auto mt-0.5">
              {currentSong?.artist}
            </p>
          </div>

          {/* Center Primary Controls */}
          <div className="flex items-center gap-3 my-auto">
            <button
              onClick={() => playPrev()}
              className="text-slate-300 hover:text-white p-1 hover:scale-110 transition-transform"
              title="Previous Track"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => togglePlayPause()}
              className={`w-9 h-9 rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform ${playbackError ? 'bg-rose-400 text-white' : 'bg-white text-dark-900'}`}
              title={playbackError ? `${playbackError.message} Retry` : playbackIntent ? 'Pause' : 'Play'}
            >
              {playbackError
                ? <RotateCcw className="w-4 h-4" />
                : isPlaybackPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : playbackIntent
                    ? <Pause className="w-4 h-4 fill-current" />
                    : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>

            <button
              onClick={() => playNext()}
              className="text-slate-300 hover:text-white p-1 hover:scale-110 transition-transform"
              title="Next Track"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bottom Utility Controls */}
          <div className="flex items-center justify-between w-full px-1 pb-0.5">
            <button
              onClick={toggleLoop}
              className={`p-1.5 rounded-lg transition-all ${
                isLooping
                  ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm scale-105'
                  : 'bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white border border-white/5'
              }`}
              title={isLooping ? 'Repeat Track: ON' : 'Repeat Track: OFF'}
            >
              <Repeat className="w-3 h-3" />
            </button>

            <button
              onClick={cycleMode}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white border border-white/5 transition-all shadow-sm hover:scale-105"
              title="Switch View Mode"
            >
              <Layers className="w-3 h-3" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
