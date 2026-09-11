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
import { usePlaybackMetrics } from '../stores/playbackMetrics';
import { audioService } from '../services/audioService';
import { isSpotifyUrl } from '../services/spotifyService';

import { handleMagneticSnapOnRelease } from '../hooks/useWindowResizer';
import { detectYoutubeResource } from '../services/youtubeService';
import { getDisplayCoverUrl, handleCoverImageError } from '../utils/coverImage';
import { isTauri } from '../utils/tauriEnv';

const formatTime = (secs: number) => {
  const minutes = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export const SongProgress: React.FC = () => {
  const { currentTime, duration } = usePlaybackMetrics(
    useShallow((state) => ({
      currentTime: state.currentTime,
      duration: state.duration,
    })),
  );

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    audioService.seek(parseFloat(e.target.value));
  };

  return (
    <div className="w-full flex items-center gap-2 text-[10px] text-slate-400 font-mono my-1">
      <span>{formatTime(currentTime)}</span>
      <input
        type="range"
        min="0"
        max={duration || 100}
        value={currentTime}
        onChange={handleSeek}
        aria-label="Song progress"
        className="flex-1 h-1 bg-th-soft-strong rounded-lg appearance-none cursor-pointer accent-th-accent hover:bg-th-soft-strong focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:outline-none"
      />
      <span>{formatTime(duration)}</span>
    </div>
  );
};

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
    volume,
    isMuted,
    toggleMute,
    isDrawerOpen,
    toggleDrawer,
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
    volume: state.volume,
    isMuted: state.isMuted,
    toggleMute: state.toggleMute,
    isDrawerOpen: state.isDrawerOpen,
    toggleDrawer: state.toggleDrawer,
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
  const ledState = playbackError ? 'error' : isPlaybackPending ? 'busy' : isPlaying ? 'play' : 'idle';
  const ledLabel = ledState === 'error' ? 'Needs retry' : ledState === 'busy' ? 'Preparing audio' : ledState === 'play' ? 'Playing' : 'Ready';

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
    } catch (error) {
      if (isTauri()) console.error('[ControlBar] minimize invoke failed: fallback used:', error);
      try {
        await getCurrentWindow().minimize();
      } catch (fallbackError) {
        if (isTauri()) console.error('[ControlBar] minimize failed entirely:', fallbackError);
      }
    }
  };

  const handleClose = async () => {
    try {
      await invoke('hide_window');
    } catch (error) {
      if (isTauri()) console.error('[ControlBar] hide invoke failed: fallback used:', error);
      try {
        await getCurrentWindow().hide();
      } catch (fallbackError) {
        if (isTauri()) console.error('[ControlBar] hide failed entirely:', fallbackError);
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
    } catch (error) {
      if (isTauri()) console.error('[ControlBar] startDragging failed:', error);
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
                className="w-full min-w-0 bg-transparent border-none outline-none text-th-primary text-xs placeholder:text-th-muted font-medium disabled:text-th-faint rounded-md focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:bg-th-soft"
              />
            </div>

            <button
              type="submit"
              disabled={!inputUrl.trim() || isImportTaskActive}
              className="h-8 px-4 ml-2 bg-th-soft-strong hover:bg-th-soft-strong disabled:hover:bg-th-soft border border-th-line transition-all rounded-xl text-th-primary text-[11px] font-semibold flex flex-shrink-0 items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImportTaskActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : detectedResource?.kind === 'playlist' ? <ListMusic className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {detectedResource?.kind === 'playlist' ? 'Import' : 'Add'}
            </button>
            <button
              type="button"
              onClick={closeImportLedger}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center ml-1 text-th-muted hover:text-th-primary transition-colors rounded-full hover:bg-th-soft-strong active:scale-95"
              title={isImportTaskActive ? 'Hide process' : 'Close link input'}
              aria-label={isImportTaskActive ? 'Hide process' : 'Close link input'}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {importTask && (
            <div className="px-3 pb-2 pt-1">
              <div className="flex items-center justify-between">
                <p className="truncate text-[10px] text-th-secondary pl-6">{importTask.message}</p>
                <div className="flex items-center gap-2">
                  {isImportTaskActive && (
                    <button type="button" onClick={() => void cancelImportTask()} className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 transition-colors">Cancel</button>
                  )}
                  {isImportFailure && importTask.retryable && (
                    <button type="button" onClick={() => void retryImportTask()} className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors"><RotateCcw className="h-3 w-3" /> Retry</button>
                  )}
                  {isImportSuccess && importTask.targetPlaylistId && (
                    <button type="button" onClick={openImportedPlaylist} className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 transition-colors">Open playlist</button>
                  )}
                </div>
              </div>

              {isImportTaskActive && (
                <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-th-soft mx-1" aria-hidden="true">
                  <div className="h-full w-1/3 animate-[signal-scan_1.15s_ease-in-out_infinite] bg-amber-400 rounded-full" />
                </div>
              )}

              {importTask.report && (
                <div className="mt-2 rounded-xl bg-th-soft overflow-hidden border border-th-line">
                  <button
                    type="button"
                    onClick={() => setReportOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-th-soft transition-colors"
                    aria-expanded={isReportOpen}
                  >
                    <span className="flex gap-4">
                      {[
                        ['Added', importTask.report.added],
                        ['Duplicates', importTask.report.duplicates],
                        ['Skipped', importTask.report.skipped],
                        ['Limit 100', importTask.report.truncated ? 'Yes' : '—'],
                      ].map(([label, value]) => (
                        <span key={label} className="flex flex-col">
                          <strong className="font-mono text-[11px] text-th-primary">{value}</strong>
                          <span className="text-[8px] uppercase tracking-wider text-th-muted">{label}</span>
                        </span>
                      ))}
                    </span>
                    <span className="text-[10px] font-medium text-amber-400/80">
                      {isReportOpen ? 'Close' : 'Details'}
                    </span>
                  </button>
                  {isReportOpen && importTask.report.skippedItems.length > 0 && (
                    <div className="max-h-24 overflow-y-auto border-t border-th-line px-3 py-2 space-y-1.5">
                      {importTask.report.skippedItems.map((item, index) => (
                        <div key={`${item.title}-${index}`} className="flex items-start gap-2 text-[10px]">
                          <span className="min-w-0 flex-1 truncate text-th-secondary">{item.title}</span>
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

      {/* Main Mode 1 Card: Top Console Unit (~420px wide), with dockPosition aware animation */}
      <div
        className={`mode-one-no-outer-shadow group/card w-[420px] h-[160px] glass-panel drawer-top-console rounded-t-3xl rounded-b-2xl p-3 flex items-center gap-3 border border-th-line relative z-20 overflow-hidden ${getAnimationClass()}`}
      >
        {/* Dedicated Top Header Drag Strip (Tactile Drag Region) */}
        <div
          data-tauri-drag-region
          onMouseDown={handleStartDrag}
          className="absolute top-0 left-0 right-0 h-6 z-30 cursor-grab active:cursor-grabbing flex items-center justify-center group"
          title="Drag Widget"
        >
          <div className="w-10 h-1 rounded-full bg-th-soft-strong group-hover:bg-amber-400/40 transition-colors mt-1" />
        </div>



        {/* Status LED anchored to the vinyl deck: aligned to the disc's top edge, not the corner */}
        <div
          role="status"
          aria-label={`Playback status: ${ledLabel}`}
          title={ledLabel}
          className={`pointer-events-none absolute left-3 top-6 z-20 h-2 w-2 rounded-full transition-all duration-300 ${
            ledState === 'error'
              ? 'hi-fi-led-error'
              : ledState === 'busy'
                ? 'hi-fi-led-busy animate-pulse motion-reduce:animate-none'
                : ledState === 'play'
                  ? 'hi-fi-led-on'
                  : 'hi-fi-led-off'
          }`}
        />

        {/* Left Side: Prominent Spinning Vinyl Record Turntable */}
        <div className="relative flex h-28 w-28 flex-shrink-0 items-center justify-center">

          {/* Metallic Tonearm Needle */}
          <div className="pointer-events-none absolute -top-1 right-0 z-20 flex flex-col items-center">
            <div className="h-3 w-3 rounded-full border border-slate-300 bg-gradient-to-tr from-slate-600 to-slate-400 shadow-md" />
            <div
              className={`z-10 h-16 w-0.5 origin-top rounded-sm bg-gradient-to-b from-slate-400 to-slate-200 shadow-lg transition-transform duration-700 ${
                isPlaying ? 'rotate-[22deg]' : 'rotate-[0deg]'
              }`}
            >
              <div className="w-1.5 h-2.5 bg-slate-700 border border-slate-300 absolute -bottom-1 -left-0.5 rounded-xs" />
            </div>
          </div>

          {/* Vinyl Record Disc */}
          <div className="vinyl-grooves relative flex h-[110px] w-[110px] items-center justify-center rounded-full border-2 border-neutral-800 shadow-2xl">
            {/* Vinyl Shine Animation */}
            <div className={`absolute inset-0 rounded-full vinyl-shine ${isPlaying ? 'animate-spin-slow' : ''}`} />

            {/* Center Album Cover Badge */}
            <div className={`relative h-10 w-10 overflow-hidden rounded-full border-2 border-neutral-900 shadow-inner ${
              isPlaying ? 'animate-spin-slow' : ''
            }`}>
              <img
                src={getDisplayCoverUrl(currentSong?.coverUrl, 128)}
                onError={handleCoverImageError}
                alt={currentSong?.title}
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 m-auto h-2 w-2 rounded-full border border-[color-mix(in_srgb,var(--th-400)_50%,transparent)] bg-neutral-950 shadow-inner" />
            </div>
          </div>
        </div>

        {/* Right Side: Song Info, Controls, Progress, & Drawer Button */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-[114px] pt-1 pb-0.5">

          {/* Top Row: Track Details & Dock/Window Actions */}
          <div className="min-w-0 flex-1">
            {/* Spacer keeps the title row in place; window actions float on the LED line */}
            <div className="h-4 mb-0.5" />

            {/* Window Actions: fade in on card hover, vertically centered on the LED line */}
            <div
              className={`absolute right-3 top-[21px] z-30 flex items-center gap-1 transition-all duration-150 ease-out opacity-0 translate-y-1 pointer-events-none group-hover/card:opacity-100 group-hover/card:translate-y-0 group-hover/card:pointer-events-auto group-focus-within/card:opacity-100 group-focus-within/card:translate-y-0 group-focus-within/card:pointer-events-auto motion-reduce:translate-y-0 motion-reduce:transition-none`}
            >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleMinimize();
                  }}
                  title="Minimize Widget"
                  aria-label="Minimize Widget"
                  className="p-0.5 rounded-md text-slate-400 hover:text-amber-300 hover:bg-th-soft-strong transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none"
                >
                  <Minus className="w-3 h-3" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleClose();
                  }}
                  title="Close Application"
                  aria-label="Close Application"
                  className="p-0.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-rose-400/70 focus-visible:outline-none"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

            {/* Track Title + Always visible Add URL (+) */}
            <div className="flex items-center gap-1.5">
              <h4 className="flex-1 min-w-0 text-sm font-bold text-th-primary truncate tracking-wide font-sans">
                {currentSong?.title || 'No track playing'}
              </h4>
              <button
                onClick={() => {
                  if (!isUrlInputOpen && !inputUrl && importTask) setInputUrl(importTask.inputUrl);
                  setUrlInputOpen(!isUrlInputOpen);
                }}
                title="Add YouTube or Spotify link"
                aria-label="Add YouTube or Spotify link"
                className={`relative flex-shrink-0 rounded-lg p-1 transition-all active:scale-90 hover:bg-th-soft-strong focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none ${importTask && !isUrlInputOpen ? 'text-amber-300' : 'text-slate-400 hover:text-th-primary'}`}
              >
                <Plus className="w-3.5 h-3.5" />
                {isImportTaskActive && !isUrlInputOpen && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-300" />}
              </button>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5 font-sans">
              {currentSong?.artist || 'Select from Music Drawer'}
            </p>
          </div>

          {/* Middle Row: Progress Slider */}
          <SongProgress />

          {/* Bottom Row: Perfect 2 - 3 - 2 Symmetric Hi-Fi Composition */}
          <div className="flex items-center justify-between mt-0.5">
            {/* Left Utility: Volume & Loop Controls */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="p-1.5 text-slate-400 hover:text-th-primary transition-all active:scale-90 rounded-xl hover:bg-th-soft focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none"
                title="Mute/Unmute"
                aria-label="Mute/Unmute"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={toggleLoop}
                className={`p-1.5 rounded-xl transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none border ${
                  isLooping
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/40 shadow-sm'
                    : 'text-slate-400 hover:text-th-primary hover:bg-th-soft border-transparent'
                }`}
                title={isLooping ? 'Loop: ON (Repeat This Track)' : 'Loop: OFF'}
                aria-label="Toggle Loop"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Center Anchor: Perfectly Centered Primary Playback Controls (Prev, Prominent Play Circle, Next) */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => playPrev()}
                className="text-slate-400 hover:text-th-primary transition-all p-1 hover:scale-110 active:scale-90 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none rounded-lg"
                title="Previous Track"
                aria-label="Previous Track"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => togglePlayPause()}
                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center hover:scale-105 active:scale-90 transition-transform shadow-lg shadow-black/10 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none ${playbackError ? 'bg-rose-400 text-white' : 'bg-th-pill-active text-th-pill-active-text'}`}
                title={playbackError ? `${playbackError.message} Retry` : playbackIntent ? 'Pause' : 'Play'}
                aria-label={playbackError ? 'Retry' : playbackIntent ? 'Pause' : 'Play'}
              >
                {playbackError
                  ? <RotateCcw className="w-3.5 h-3.5" />
                  : isPlaybackPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : playbackIntent
                      ? <Pause className="w-3.5 h-3.5 fill-current" />
                      : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => playNext()}
                className="text-slate-400 hover:text-th-primary transition-all p-1 hover:scale-110 active:scale-90 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none rounded-lg"
                title="Next Track"
                aria-label="Next Track"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right Utility: Mode Switcher (Cycle 1 -> 2 -> 3) & Pure Cabinet Drawer Button */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleDrawer}
                className={`p-1.5 rounded-xl border transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none ${
                  isDrawerOpen
                    ? 'bg-th-pill-active text-th-pill-active-text border-th-pill-active shadow-lg scale-105'
                    : 'bg-th-soft hover:bg-th-soft-strong text-slate-300 border-th-line'
                }`}
                title="Open / Close Music Drawer"
                aria-label="Open or Close Music Drawer"
              >
                <FolderKanban className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={cycleMode}
                className="p-1.5 rounded-xl bg-th-soft hover:bg-th-soft-strong text-slate-400 hover:text-th-primary border border-th-line transition-all active:scale-90 focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:outline-none"
                title="Switch to Next Mode (Mode 2 Vinyl / Mode 3 Bubble)"
                aria-label="Switch to next mode"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
