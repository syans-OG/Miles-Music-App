import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Layers,
  Plus,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Repeat,
  Loader2,
  RotateCcw,
  Minus,
  X,
  AlertTriangle,
  Check,
  ListMusic
} from 'lucide-react';

import { usePlayerStore } from '../stores/usePlayerStore';
import { audioService } from '../services/audioService';
import { isSpotifyUrl } from '../services/spotifyService';

import { handleMagneticSnapOnRelease } from '../hooks/useWindowResizer';
import { detectYoutubeResource } from '../services/youtubeService';
import { getDisplayCoverUrl } from '../utils/coverImage';

export const ControlBar: React.FC = () => {
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
    currentTime,
    duration,
    volume,
    isMuted,
    toggleMute,
    isDrawerOpen,
    toggleDrawer,
    isTopControlOpen,
    toggleTopControl,
    cycleMode,
    youtubeImportTask,
    spotifyImportTask,
    addSongFromUrl,
    cancelYoutubeTask,
    retryYoutubeTask,
    dismissYoutubeTask,
    cancelSpotifyTask,
    retrySpotifyTask,
    dismissSpotifyTask,
    isUrlInputOpen,
    setUrlInputOpen,
    setDrawerOpen,
    setDrawerTab,
    selectPlaylist,
    dockPosition,
    prevMode,
    setDockPosition
  } = usePlayerStore(useShallow((state) => ({
    currentSong: state.currentSong,
    isPlaying: state.isPlaying,
    playbackIntent: state.playbackIntent,
    playbackStatus: state.playbackStatus,
    playbackError: state.playbackError,
    setPlaybackIntent: state.setPlaybackIntent,
    togglePlayPause: state.togglePlayPause,
    requestPlaybackRetry: state.requestPlaybackRetry,
    isLooping: state.isLooping,
    toggleLoop: state.toggleLoop,
    playNext: state.playNext,
    playPrev: state.playPrev,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    isMuted: state.isMuted,
    toggleMute: state.toggleMute,
    isDrawerOpen: state.isDrawerOpen,
    toggleDrawer: state.toggleDrawer,
    isTopControlOpen: state.isTopControlOpen,
    toggleTopControl: state.toggleTopControl,
    cycleMode: state.cycleMode,
    youtubeImportTask: state.youtubeImportTask,
    spotifyImportTask: state.spotifyImportTask,
    addSongFromUrl: state.addSongFromUrl,
    cancelYoutubeTask: state.cancelYoutubeTask,
    retryYoutubeTask: state.retryYoutubeTask,
    dismissYoutubeTask: state.dismissYoutubeTask,
    cancelSpotifyTask: state.cancelSpotifyTask,
    retrySpotifyTask: state.retrySpotifyTask,
    dismissSpotifyTask: state.dismissSpotifyTask,
    isUrlInputOpen: state.isUrlInputOpen,
    setUrlInputOpen: state.setUrlInputOpen,
    setDrawerOpen: state.setDrawerOpen,
    setDrawerTab: state.setDrawerTab,
    selectPlaylist: state.selectPlaylist,
    dockPosition: state.dockPosition,
    prevMode: state.prevMode,
    setDockPosition: state.setDockPosition,
  })));

  const [inputUrl, setInputUrl] = useState('');
  const [isReportOpen, setReportOpen] = useState(false);
  const detectedSpotify = inputUrl.trim() ? isSpotifyUrl(inputUrl) : false;
  const detectedResource = inputUrl.trim() ? detectYoutubeResource(inputUrl) : null;
  const isYoutubeTaskActive = youtubeImportTask?.status === 'importing' || youtubeImportTask?.status === 'resolving';
  const isSpotifyTaskActive = spotifyImportTask?.status === 'fetching' || spotifyImportTask?.status === 'matching';
  const isImportTaskActive = isYoutubeTaskActive || isSpotifyTaskActive;
  const importTask = spotifyImportTask ?? youtubeImportTask;
  const showingSpotifyTask = spotifyImportTask !== null;
  const isImportSuccess = importTask?.status === 'success'
    || importTask?.status === 'completed'
    || importTask?.status === 'partial';
  const isImportFailure = importTask?.status === 'error' || importTask?.status === 'cancelled';
  const isPlaybackPending = playbackStatus === 'resolving' || playbackStatus === 'loading' || playbackStatus === 'buffering';
  const playbackLabel = playbackError
    ? 'RETRY'
    : playbackStatus === 'resolving'
      ? 'PREPARING AUDIO…'
      : playbackStatus === 'loading'
        ? 'LOADING SONG…'
        : playbackStatus === 'buffering'
          ? 'BUFFERING…'
          : isPlaying ? 'PLAY' : 'READY';

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    audioService.seek(time);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim() || isImportTaskActive) return;
    setReportOpen(false);
    void addSongFromUrl(inputUrl);
  };

  const closeImportLedger = () => {
    if (showingSpotifyTask) dismissSpotifyTask();
    else dismissYoutubeTask();
    if (!isImportTaskActive) {
      setInputUrl('');
      setReportOpen(false);
    } else {
      setUrlInputOpen(false);
    }
  };

  const openImportedPlaylist = () => {
    if (!importTask?.targetPlaylistId) return;
    setUrlInputOpen(false);
    setDrawerOpen(true);
    setDrawerTab('playlist');
    selectPlaylist(importTask.targetPlaylistId);
  };

  const cancelImportTask = () => showingSpotifyTask
    ? cancelSpotifyTask()
    : cancelYoutubeTask();

  const retryImportTask = () => showingSpotifyTask
    ? retrySpotifyTask()
    : retryYoutubeTask();

  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch {
      try {
        await getCurrentWindow().minimize();
      } catch {
        // Browser fallback
      }
    }
  };

  const handleClose = async () => {
    try {
      await invoke('hide_window');
    } catch {
      try {
        await getCurrentWindow().hide();
      } catch {
        // Browser fallback
      }
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
      const win = getCurrentWindow();
      await win.startDragging();
      setTimeout(() => {
        handleMagneticSnapOnRelease(setDockPosition);
      }, 300);
    } catch {
      // Browser fallback
    }
  };



  const getAnimationClass = () => {
    const isFromMode3 = prevMode === 'micro-bubble';
    const prefix = isFromMode3 ? 'animate-expand-mode1-from-mode3' : 'animate-expand-mode1';
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

  return (
    <div className="relative flex w-[460px] flex-col items-center justify-center p-2">
      {/* Quick Add URL expands the native window, matching the drawer behavior. */}
      {isUrlInputOpen && (
        <form
          onSubmit={handleUrlSubmit}
          className="youtube-signal-ledger z-30 mb-4 w-[420px] glass-panel backdrop-blur-xl rounded-2xl overflow-hidden p-1 animate-fade-in motion-reduce:animate-none"
          aria-label="Add YouTube or Spotify link"
        >
          <div className="flex items-center p-2">
            <div className="flex flex-col justify-center pl-3 pr-2">
              {isImportTaskActive ? (
                <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
              ) : isImportSuccess ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : isImportFailure ? (
                <AlertTriangle className="h-3 w-3 text-rose-400" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse" />
              )}
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <input
                type="text"
                placeholder={detectedSpotify ? 'Spotify link detected...' : detectedResource?.kind === 'playlist' ? 'YouTube playlist detected...' : detectedResource?.kind === 'video' ? 'YouTube video detected...' : 'Paste link YouTube or Spotify'}
                value={inputUrl}
                onChange={(event) => setInputUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeImportLedger();
                }}
                disabled={isImportTaskActive}
                autoFocus
                className="w-full min-w-0 bg-transparent border-none outline-none text-white text-xs placeholder-white/40 font-medium disabled:text-white/30"
              />
            </div>

            <button
              type="submit"
              disabled={!inputUrl.trim() || isImportTaskActive}
              className="h-8 px-4 ml-2 bg-white/10 hover:bg-white/20 disabled:hover:bg-white/5 border border-white/5 transition-all rounded-xl text-white text-[11px] font-semibold flex flex-shrink-0 items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImportTaskActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : detectedResource?.kind === 'playlist' ? <ListMusic className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {detectedResource?.kind === 'playlist' ? 'Import' : 'Add'}
            </button>
            <button
              type="button"
              onClick={closeImportLedger}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center ml-1 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/10 active:scale-95"
              title={isImportTaskActive ? 'Hide process' : 'Close link input'}
              aria-label={isImportTaskActive ? 'Hide process' : 'Close link input'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {importTask && (
            <div className="px-3 pb-2 pt-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-[10px] text-white/60 pl-6">{importTask.message}</p>
                <div className="flex items-center gap-2">
                  {isImportTaskActive && (
                    <button type="button" onClick={() => void cancelImportTask()} className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 transition-colors">Batalkan</button>
                  )}
                  {isImportFailure && importTask.retryable && (
                    <button type="button" onClick={() => void retryImportTask()} className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"><RotateCcw className="h-3 w-3" /> Coba lagi</button>
                  )}
                  {isImportSuccess && importTask.targetPlaylistId && (
                    <button type="button" onClick={openImportedPlaylist} className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors">Buka playlist</button>
                  )}
                </div>
              </div>

              {isImportTaskActive && (
                <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/5 mx-1" aria-hidden="true">
                  <div className="h-full w-1/3 animate-[signal-scan_1.15s_ease-in-out_infinite] bg-amber-400 rounded-full" />
                </div>
              )}

              {importTask.report && (
                <div className="mt-2 rounded-xl bg-black/20 overflow-hidden border border-white/5">
                  <button
                    type="button"
                    onClick={() => setReportOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                    aria-expanded={isReportOpen}
                  >
                    <span className="flex gap-4">
                      {[
                        ['Masuk', importTask.report.added],
                        ['Duplikat', importTask.report.duplicates],
                        ['Dilewati', importTask.report.skipped],
                        ['Batas 100', importTask.report.truncated ? 'Ya' : '—'],
                      ].map(([label, value]) => (
                        <span key={label} className="flex flex-col">
                          <strong className="font-mono text-[11px] text-white/90">{value}</strong>
                          <span className="text-[8px] uppercase tracking-wider text-white/40">{label}</span>
                        </span>
                      ))}
                    </span>
                    <span className="text-[10px] font-medium text-amber-400/80">
                      {isReportOpen ? 'Tutup' : 'Detail'}
                    </span>
                  </button>
                  {isReportOpen && importTask.report.skippedItems.length > 0 && (
                    <div className="max-h-24 overflow-y-auto border-t border-white/5 px-3 py-2 space-y-1.5">
                      {importTask.report.skippedItems.map((item, index) => (
                        <div key={`${item.title}-${index}`} className="flex items-start gap-2 text-[10px]">
                          <span className="min-w-0 flex-1 truncate text-white/60">{item.title}</span>
                          <span className="flex-shrink-0 text-rose-400/80">{item.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Main Mode 1 Card: Top Console Unit (~440px wide), with dockPosition aware animation */}
      <div
        className={`mode-one-no-outer-shadow w-[440px] h-[176px] glass-panel drawer-top-console rounded-t-3xl rounded-b-2xl p-4 flex items-center gap-4 border border-white/10 relative z-20 overflow-hidden ${getAnimationClass()}`}
      >
        {/* Dedicated Top Header Drag Strip (Tactile Drag Region) */}
        <div
          data-tauri-drag-region
          onMouseDown={handleStartDrag}
          className="absolute top-0 left-0 right-0 h-7 z-30 cursor-grab active:cursor-grabbing flex items-center justify-center group"
          title="Geser Widget (Drag Header)"
        >
          <div className="w-12 h-1 rounded-full bg-white/10 group-hover:bg-amber-400/40 transition-colors mt-1.5" />
        </div>



        {/* Left Side: Prominent Spinning Vinyl Record Turntable */}
        <div className="relative flex h-32 w-32 flex-shrink-0 items-center justify-center">

          {/* Metallic Tonearm Needle */}
          <div className="pointer-events-none absolute -top-1 right-0 z-20 flex flex-col items-center">
            <div className="h-3.5 w-3.5 rounded-full border border-slate-300 bg-gradient-to-tr from-slate-600 to-slate-400 shadow-md" />
            <div
              className={`z-10 h-20 w-0.5 origin-top rounded-sm bg-gradient-to-b from-slate-400 to-slate-200 shadow-lg transition-transform duration-700 ${
                isPlaying ? 'rotate-[22deg]' : 'rotate-[0deg]'
              }`}
            >
              <div className="w-2 h-3 bg-slate-700 border border-slate-300 absolute -bottom-1 -left-0.75 rounded-xs" />
            </div>
          </div>

          {/* Vinyl Record Disc */}
          <div className="vinyl-grooves relative flex h-[124px] w-[124px] items-center justify-center rounded-full border-2 border-neutral-800 shadow-2xl">
            {/* Vinyl Shine Animation */}
            <div className={`absolute inset-0 rounded-full vinyl-shine ${isPlaying ? 'animate-spin-slow' : ''}`} />

            {/* Center Album Cover Badge */}
            <div className={`relative h-12 w-12 overflow-hidden rounded-full border-2 border-neutral-900 shadow-inner ${
              isPlaying ? 'animate-spin-slow' : ''
            }`}>
              <img
                src={getDisplayCoverUrl(currentSong?.coverUrl, 128)}
                alt={currentSong?.title}
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full border border-slate-400/50 bg-neutral-950 shadow-inner" />
            </div>
          </div>
        </div>

        {/* Right Side: Song Info, Controls, Progress, & Drawer Button */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-[126px] pt-1.5 pb-0.5">

          {/* Top Row: Track Details & Dock/Window Actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {/* Hi-Fi LED Digital Display Readout */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${isPlaying ? 'hi-fi-led-on' : 'hi-fi-led-off'}`} />
                <span className="text-[9px] font-mono font-bold tracking-widest text-amber-400 uppercase">{playbackLabel}</span>
              </div>

              <h4 className="text-sm font-bold text-white truncate tracking-wide font-sans">
                {currentSong?.title || 'No track playing'}
              </h4>
              <p className="text-xs text-slate-400 truncate mt-0.5 font-sans">
                {currentSong?.artist || 'Select from Music Drawer'}
              </p>
            </div>

            {/* Action Buttons: Flat Inline Pushing Ribbon Controls */}
            <div className="flex items-center gap-1">
              {/* Always visible Add YT Link (+) */}
              <button
                onClick={() => {
                  if (!isUrlInputOpen && !inputUrl && importTask) setInputUrl(importTask.inputUrl);
                  setUrlInputOpen(!isUrlInputOpen);
                }}
                title="Add YouTube or Spotify link"
                className={`relative rounded-lg p-1 transition-colors hover:bg-white/10 ${importTask && !isUrlInputOpen ? 'text-amber-300' : 'text-slate-400 hover:text-white'}`}
              >
                <Plus className="w-3.5 h-3.5" />
                {isImportTaskActive && !isUrlInputOpen && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-300" />}
              </button>

              {/* Expandable Window Actions (Minimize & Close) */}
              {isTopControlOpen && (
                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-3 duration-300">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleMinimize();
                    }}
                    title="Minimize Widget"
                    className="p-1 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/10 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleClose();
                    }}
                    title="Close Application"
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Toggle Button: < (expand) / > (collapse) */}
              <button
                type="button"
                onClick={toggleTopControl}
                title={isTopControlOpen ? 'Sembunyikan Kontrol Jendela' : 'Tampilkan Kontrol Jendela (Minimize & Close)'}
                className={`p-1 text-slate-400 hover:text-white transition-all rounded-lg hover:bg-white/10 ${
                  isTopControlOpen ? 'text-amber-400 font-bold bg-white/10' : ''
                }`}
              >
                {isTopControlOpen ? (
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5" />
                )}
              </button>

            </div>



          </div>

          {/* Middle Row: Progress Slider */}
          <div className="w-full flex items-center gap-2 text-[10px] text-slate-400 font-mono my-1">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white hover:bg-white/20"
            />
            <span>{formatTime(duration)}</span>
          </div>

          {/* Bottom Row: Perfect 2 - 3 - 2 Symmetric Hi-Fi Composition */}
          <div className="flex items-center justify-between mt-0.5">
            {/* Left Utility: Volume & Loop Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/5"
                title="Mute/Unmute"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={toggleLoop}
                className={`p-1.5 rounded-xl transition-all ${
                  isLooping
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                title={isLooping ? 'Loop: AKTIF (Ulangi Lagu Ini)' : 'Loop: NONAKTIF'}
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Center Anchor: Perfectly Centered Primary Playback Controls (Prev, Prominent Play Circle, Next) */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => playPrev()}
                className="text-slate-400 hover:text-white transition-colors p-1 hover:scale-110"
                title="Previous Track"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => togglePlayPause()}
                className={`w-8.5 h-8.5 rounded-full flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-white/10 ${playbackError ? 'bg-rose-400 text-white' : 'bg-white text-dark-900'}`}
                title={playbackError ? `${playbackError.message} Coba lagi` : playbackIntent ? 'Pause' : 'Play'}
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
                className="text-slate-400 hover:text-white transition-colors p-1 hover:scale-110"
                title="Next Track"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Utility: Mode Switcher (Cycle 1 -> 2 -> 3) & Pure Cabinet Drawer Button */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={cycleMode}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white border border-white/5 transition-all"
                title="Pindah ke Mode Berikutnya (Mode 2 Vinyl / Mode 3 Bubble)"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleDrawer}
                className={`p-1.5 rounded-xl border transition-all ${
                  isDrawerOpen
                    ? 'bg-white text-dark-900 border-white shadow-lg scale-105'
                    : 'bg-white/5 hover:bg-white/15 text-slate-300 border-white/10'
                }`}
                title="Buka / Tutup Laci Musik"
              >
                <FolderKanban className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
