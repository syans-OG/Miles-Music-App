import type { Song } from '../types/player';
import { usePlayerStore } from '../stores/usePlayerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import {
  clearYoutubeStreamCache,
  getCachedYoutubeStream,
  resolveYoutubeTrack,
  YoutubeServiceError,
  type YoutubeResolvePurpose,
} from './youtubeService';
import { matchSpotifyTrack } from './spotifyService';
import { syncDiscordActivity } from './discordRpcService';

interface MediaErrorLike {
  code: number;
}

export interface AudioElementLike {
  currentTime: number;
  duration: number;
  ended?: boolean;
  error: MediaErrorLike | null;
  preload: string;
  src: string;
  volume: number;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
  load: () => void;
  pause: () => void;
  play: () => Promise<void>;
  removeAttribute: (name: string) => void;
}

interface AudioServiceDependencies {
  audio?: AudioElementLike;
  resolveTrack?: typeof resolveYoutubeTrack;
  getCachedStream?: typeof getCachedYoutubeStream;
  clearStreamCache?: typeof clearYoutubeStreamCache;
  matchSpotifyTrack?: typeof matchSpotifyTrack;
}

const AUTO_SKIP_CODES = new Set([
  'live_unsupported',
  'upcoming_unsupported',
  'private_video',
  'age_restricted',
  'unavailable',
  'audio_stream_unavailable',
]);

const skipReason = (error: YoutubeServiceError) => {
  if (error.code === 'live_unsupported') return 'Live Stream tidak didukung';
  if (error.code === 'upcoming_unsupported') return 'video belum tayang';
  if (error.code === 'private_video') return 'video privat';
  if (error.code === 'age_restricted') return 'batasan usia';
  return 'tidak tersedia';
};

const youtubeResolveKey = (song: Song): string | null => {
  if (song.source.kind === 'youtube') return song.source.videoId || null;
  if (song.source.kind === 'spotify') return song.source.matchedVideoId || null;
  return null;
};

export class AudioService {
  private readonly audio: AudioElementLike;
  private readonly resolveTrack: typeof resolveYoutubeTrack;
  private readonly getCachedStream: typeof getCachedYoutubeStream;
  private readonly clearStreamCache: typeof clearYoutubeStreamCache;
  private readonly matchSpotifyTrack: typeof matchSpotifyTrack;
  private readonly unsubscribers: Array<() => void> = [];
  private detachLoadListeners: (() => void) | null = null;
  private loadGeneration = 0;
  private prefetchGeneration = 0;
  private assignedSource: string | null = null;
  private mediaRetryUsed = false;
  private silentMediaRetryCount = 0;
  private prefetchedKey: string | null = null;
  private autoSkipVisited = new Set<string>();
  private lastCountedSelection = -1;
  private lastCountedSongId: string | null = null;
  private lastRecordedTime = 0;
  private handlingSelection = false;

  constructor(dependencies: AudioServiceDependencies = {}) {
    this.audio = dependencies.audio ?? new Audio();
    this.resolveTrack = dependencies.resolveTrack ?? resolveYoutubeTrack;
    this.getCachedStream = dependencies.getCachedStream ?? getCachedYoutubeStream;
    this.clearStreamCache = dependencies.clearStreamCache ?? clearYoutubeStreamCache;
    this.matchSpotifyTrack = dependencies.matchSpotifyTrack ?? matchSpotifyTrack;
    this.audio.preload = 'metadata';

    this.unsubscribers.push(
      usePlayerStore.subscribe(
        (state) => state.selectionSerial,
        () => this.handleSelectionChange(),
      ),
      usePlayerStore.subscribe(
        (state) => state.playbackIntent,
        (shouldPlay) => this.handleIntentChange(shouldPlay),
      ),
      usePlayerStore.subscribe(
        (state) => state.playbackRetryToken,
        () => this.handleRetryRequest(),
      ),
      usePlayerStore.subscribe(
        (state) => state.playbackQueue.map((song) => song.id).join('\u0000'),
        () => {
          this.prefetchGeneration += 1;
          this.prefetchedKey = null;
        },
      ),
      usePlayerStore.subscribe(
        (state) => (state.isMuted ? 0 : Math.max(0, Math.min(1, state.volume))),
        (effectiveVolume) => {
          try {
            this.audio.volume = effectiveVolume;
          } catch {
            // Safe fallback
          }
        },
      ),
    );

    const restored = usePlayerStore.getState();
    try {
      this.audio.volume = restored.isMuted ? 0 : Math.max(0, Math.min(1, restored.volume));
    } catch {
      // Safe fallback
    }
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  private readonly handleBeforeUnload = () => {
    usePlayerStore.getState().checkpointPlaybackPosition(this.audio.currentTime);
  };

  private handleSelectionChange() {
    const state = usePlayerStore.getState();
    if (state.currentSong?.id !== this.lastCountedSongId || state.selectionReason === 'manual') {
      this.lastCountedSongId = null;
    }
    this.handlingSelection = true;
    this.loadGeneration += 1;
    this.prefetchGeneration += 1;
    this.prefetchedKey = null;
    this.mediaRetryUsed = false;
    this.silentMediaRetryCount = 0;
    if (state.selectionReason !== 'auto_skip') this.autoSkipVisited.clear();
    this.detachCurrentLoad();
    this.audio.pause();
    this.clearAssignedSource();
    state.setDuration(state.currentSong?.duration ?? 0);
    state.setPlaybackStatus('idle');
    if (state.playbackIntent) this.startLoadCycle(true);
    this.handlingSelection = false;
  }

  private handleIntentChange(shouldPlay: boolean) {
    if (this.handlingSelection) return;
    if (!shouldPlay) {
      this.audio.pause();
      if (!this.assignedSource) usePlayerStore.getState().setPlaybackStatus('idle');
      return;
    }
    if (this.assignedSource) {
      void this.playAssignedSource(this.loadGeneration);
      return;
    }
    const status = usePlayerStore.getState().playbackStatus;
    if (status === 'resolving' || status === 'loading') return;
    this.startLoadCycle(true);
  }

  private handleRetryRequest() {
    const state = usePlayerStore.getState();
    if (!state.currentSong || !state.playbackIntent) return;
    const resolveKey = youtubeResolveKey(state.currentSong);
    if (resolveKey) this.clearStreamCache(resolveKey);
    this.loadGeneration += 1;
    this.mediaRetryUsed = false;
    this.silentMediaRetryCount = 0;
    this.audio.pause();
    this.clearAssignedSource();
    state.setPlaybackStatus('idle');
    this.startLoadCycle(true);
  }

  private startLoadCycle(resetMediaRetry: boolean) {
    const state = usePlayerStore.getState();
    if (!state.currentSong || !state.playbackIntent) return;
    this.loadGeneration += 1;
    if (resetMediaRetry) this.mediaRetryUsed = false;
    const generation = this.loadGeneration;
    const selectionSerial = state.selectionSerial;
    const song = state.currentSong;
    this.autoSkipVisited.add(song.id);
    void this.loadSong(song, generation, selectionSerial);
  }

  private async loadSong(song: Song, generation: number, selectionSerial: number) {
    if (song.offline) {
      usePlayerStore.getState().setPlaybackStatus('loading');
      this.assignSource(song, convertFileSrc(song.offline.filePath), generation, selectionSerial);
      await this.playAssignedSource(generation);
      return;
    }

    if (song.source.kind === 'local') {
      usePlayerStore.getState().setPlaybackStatus('loading');
      this.assignSource(song, song.source.audioUrl, generation, selectionSerial);
      await this.playAssignedSource(generation);
      return;
    }

    let resolveId = youtubeResolveKey(song);
    if (!resolveId && song.source.kind === 'spotify') {
      usePlayerStore.getState().setPlaybackStatus('resolving');
      const cleanSpotifyId = (song.source.spotifyId || song.id).replace(/^spotify-/, '');
      const validSpotifyId = cleanSpotifyId.length === 22 && /^[A-Za-z0-9]{22}$/.test(cleanSpotifyId)
        ? cleanSpotifyId
        : '0000000000000000000000';
      const rawDuration = song.duration || 180;
      const durationSeconds = Math.max(1, Math.round(rawDuration > 1000 ? rawDuration / 1000 : rawDuration));
      try {
        const matchResult = await this.matchSpotifyTrack({
          spotifyId: validSpotifyId,
          title: song.title,
          artist: song.artist,
          durationSeconds,
        }, 'playback');
        if (!this.isCurrentSelection(generation, selectionSerial, song.id) || !usePlayerStore.getState().playbackIntent) return;
        if (matchResult.status === 'matched' && matchResult.videoId) {
          resolveId = matchResult.videoId;
          usePlayerStore.getState().updateSongSource(song.id, {
            ...song.source,
            spotifyId: validSpotifyId,
            matchedVideoId: matchResult.videoId,
            canonicalUrl: matchResult.canonicalUrl,
          });
          if (matchResult.thumbnailUrl) {
            usePlayerStore.getState().updateSongMetadata(song.id, { coverUrl: matchResult.thumbnailUrl });
          }
        }
      } catch (err) {
        console.warn('[Miles AudioService] Spotify track matching failed, falling back to search query:', err);
      }
      if (!resolveId) {
        if (!this.isCurrentSelection(generation, selectionSerial, song.id)) return;
        usePlayerStore.getState().setPlaybackStatus('error');
        usePlayerStore.getState().setPlaybackError({
          songId: song.id,
          message: 'Tidak dapat menemukan padanan lagu ini di YouTube.',
          retryable: true,
        });
        return;
      }
    }

    if (!resolveId) return;
    if (song.source.kind === 'youtube' && song.source.availability !== 'available') {
      this.purgeAndSkipUnavailableSong(song, `${song.title} dihapus: tidak tersedia`);
      return;
    }

    const cached = this.getCachedStream(resolveId);
    if (cached) {
      if (song.source.kind === 'spotify' && cached.thumbnailUrl) {
        usePlayerStore.getState().updateSongMetadata(song.id, { coverUrl: cached.thumbnailUrl });
      }
      usePlayerStore.getState().setPlaybackStatus('loading');
      this.assignSource(song, cached.url, generation, selectionSerial);
      await this.playAssignedSource(generation);
      return;
    }

    usePlayerStore.getState().setPlaybackStatus('resolving');
    const purpose: YoutubeResolvePurpose = usePlayerStore.getState().selectionReason === 'sequential'
      ? 'sequential_next'
      : 'explicit_selection';
    try {
      const track = await this.resolveTrack(
        resolveId,
        purpose,
        () => this.isCurrentSelection(generation, selectionSerial, song.id) && usePlayerStore.getState().playbackIntent,
      );
      if (!this.isCurrentSelection(generation, selectionSerial, song.id) || !usePlayerStore.getState().playbackIntent) return;
      if (song.source.kind === 'spotify') {
        usePlayerStore.getState().updateSongSource(song.id, {
          ...song.source,
          matchedVideoId: track.videoId,
          canonicalUrl: track.canonicalUrl,
        });
        if (track.thumbnailUrl) {
          usePlayerStore.getState().updateSongMetadata(song.id, { coverUrl: track.thumbnailUrl });
        }
      } else if (track.thumbnailUrl && song.source.kind === 'youtube' && !song.coverUrl) {
        usePlayerStore.getState().updateSongMetadata(song.id, { coverUrl: track.thumbnailUrl });
      }
      usePlayerStore.getState().setPlaybackStatus('loading');
      this.assignSource(song, track.stream.url, generation, selectionSerial);
      await this.playAssignedSource(generation);
    } catch (error) {
      console.error('[Miles AudioService] Track resolution failed for song:', song.title, 'resolveId:', resolveId, error);
      if (!this.isCurrentSelection(generation, selectionSerial, song.id)) return;
      if (error instanceof YoutubeServiceError && error.code === 'cancelled') {
        this.mediaRetryUsed = true;
        if (resolveId) this.clearStreamCache(resolveId);
        const retryGeneration = ++this.loadGeneration;
        void this.loadSong(song, retryGeneration, selectionSerial);
        return;
      }
      if (error instanceof YoutubeServiceError && AUTO_SKIP_CODES.has(error.code)) {
        this.purgeAndSkipUnavailableSong(song, `${song.title} dihapus: ${skipReason(error)}`);
        return;
      }
      const message = error instanceof Error ? error.message : 'Gagal menyiapkan audio.';
      usePlayerStore.getState().setPlaybackError({ songId: song.id, message, retryable: true });
    }
  }

  private assignSource(song: Song, source: string, generation: number, selectionSerial: number) {
    this.detachCurrentLoad();
    this.assignedSource = source;
    this.audio.src = source;

    const isCurrent = () => this.isCurrentSelection(generation, selectionSerial, song.id)
      && this.assignedSource === source;
    const on = (event: string, listener: EventListener) => {
      this.audio.addEventListener(event, listener);
      return () => this.audio.removeEventListener(event, listener);
    };
    const detach = [
      on('loadedmetadata', () => {
        if (!isCurrent()) return;
        const state = usePlayerStore.getState();
        const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : song.duration;
        state.setDuration(duration);
        const resume = state.resumePosition?.songId === song.id ? state.resumePosition.time : 0;
        if (resume > 0 && resume < Math.max(0, duration - 3)) {
          this.audio.currentTime = resume;
          state.setCurrentTime(resume);
        } else if (resume > 0) {
          this.audio.currentTime = 0;
          state.checkpointPlaybackPosition(0);
        }
      }),
      on('timeupdate', () => {
        if (!isCurrent()) return;
        const currentTime = this.audio.currentTime;
        if (this.lastRecordedTime > 0 && currentTime > this.lastRecordedTime) {
          const delta = currentTime - this.lastRecordedTime;
          if (delta > 0.05 && delta < 3.0) {
            usePlayerStore.getState().addListenedTime(song.id, delta);
          }
        }
        this.lastRecordedTime = currentTime;
        usePlayerStore.getState().setCurrentTime(currentTime);
        this.maybePrefetchNext();
      }),
      on('seeking', () => {
        if (!isCurrent()) return;
        this.lastRecordedTime = this.audio.currentTime;
      }),
      on('seeked', () => {
        if (!isCurrent()) return;
        this.lastRecordedTime = this.audio.currentTime;
      }),
      on('playing', () => {
        if (!isCurrent()) return;
        this.lastRecordedTime = this.audio.currentTime;
        const state = usePlayerStore.getState();
        if (!state.playbackIntent) {
          this.audio.pause();
          return;
        }
        state.setPlaybackStatus('playing');
        this.autoSkipVisited.clear();
        if (this.lastCountedSelection !== selectionSerial && this.lastCountedSongId !== song.id) {
          this.lastCountedSelection = selectionSerial;
          this.lastCountedSongId = song.id;
          state.incrementPlayCount(song.id);
        }
      }),
      on('pause', () => {
        if (!isCurrent()) return;
        this.lastRecordedTime = this.audio.currentTime;
        const state = usePlayerStore.getState();
        if (this.audio.ended || (state.isLooping && state.playbackIntent)) {
          return;
        }
        if (state.playbackIntent && ['resolving', 'loading', 'buffering'].includes(state.playbackStatus)) {
          return;
        }
        if (state.playbackIntent) state.setPlaybackIntent(false);
        state.setPlaybackStatus('idle');
      }),
      on('waiting', () => {
        if (!isCurrent()) return;
        usePlayerStore.getState().setPlaybackStatus('buffering');
      }),
      on('ended', () => {
        if (!isCurrent()) return;
        this.handleEnded();
      }),
      on('error', () => {
        if (!isCurrent()) return;
        this.handleMediaError(song, generation, selectionSerial);
      }),
    ];
    this.detachLoadListeners = () => detach.forEach((remove) => remove());
    this.audio.load();
  }

  private async playAssignedSource(generation: number) {
    const state = usePlayerStore.getState();
    if (!state.playbackIntent || generation !== this.loadGeneration || !this.assignedSource) return;
    try {
      await this.audio.play();
    } catch (error) {
      console.error('[Miles AudioService] playAssignedSource caught error:', error);
      if (generation !== this.loadGeneration || !usePlayerStore.getState().playbackIntent) return;
      const resolveKey = state.currentSong ? youtubeResolveKey(state.currentSong) : null;
      if (resolveKey && !this.mediaRetryUsed) {
        this.mediaRetryUsed = true;
        this.clearStreamCache(resolveKey);
        this.clearAssignedSource();
        this.startLoadCycle(false);
        return;
      }
      const message = error instanceof Error ? error.message : 'Audio tidak dapat diputar.';
      usePlayerStore.getState().setPlaybackError({
        songId: state.currentSong?.id ?? '',
        message,
        retryable: true,
      });
    }
  }

  private handleEnded() {
    const state = usePlayerStore.getState();
    this.lastRecordedTime = 0;
    if (state.isLooping && state.currentSong) {
      state.incrementPlayCount(state.currentSong.id);
      state.setPlaybackIntent(true);
      state.setPlaybackStatus('loading');
      this.audio.currentTime = 0;
      void this.playAssignedSource(this.loadGeneration);
    } else if (state.currentIndex < state.playbackQueue.length - 1) {
      state.setPlaybackStatus('idle');
      state.playNext('sequential');
    } else if (state.queueEndBehavior === 'repeat-queue' && state.playbackQueue.length > 0) {
      state.setPlaybackStatus('idle');
      state.playNext('sequential');
    } else {
      this.audio.currentTime = 0;
      state.checkpointPlaybackPosition(0);
      state.setPlaybackStatus('idle');
      state.setPlaybackIntent(false);
    }
  }

  private handleMediaError(song: Song, generation: number, selectionSerial: number) {
    console.error('[Miles AudioService] HTML5 Audio MediaError on song:', song.title, 'code:', this.audio.error?.code, this.audio.error);
    usePlayerStore.getState().setPlaybackStatus('idle');
    const eligibleMediaFailure = this.audio.error?.code === 2 || this.audio.error?.code === 4;
    const resolveKey = youtubeResolveKey(song);
    if (resolveKey && eligibleMediaFailure && this.silentMediaRetryCount < 2) {
      this.silentMediaRetryCount += 1;
      this.mediaRetryUsed = true;
      this.clearStreamCache(resolveKey);
      this.clearAssignedSource();
      this.loadGeneration += 1;
      const retryGeneration = this.loadGeneration;
      void this.loadSong(song, retryGeneration, selectionSerial);
      return;
    }
    if (!this.isCurrentSelection(generation, selectionSerial, song.id)) return;
    usePlayerStore.getState().setPlaybackError({
      songId: song.id,
      message: 'Audio gagal dimuat. Silakan coba lagi.',
      retryable: true,
    });
  }

  private purgeAndSkipUnavailableSong(song: Song, notice: string) {
    const state = usePlayerStore.getState();
    const candidates = state.playbackQueue.length > 0 ? state.playbackQueue : state.queue;
    let nextSongId: string | null = null;
    for (let offset = 1; offset <= candidates.length; offset += 1) {
      const index = (state.currentIndex + offset) % candidates.length;
      const candidate = candidates[index];
      if (candidate && candidate.id !== song.id && !this.autoSkipVisited.has(candidate.id)) {
        nextSongId = candidate.id;
        break;
      }
    }
    if (song.source.kind === 'youtube') this.clearStreamCache(song.source.videoId);
    state.purgeUnavailableYoutubeSong(song.id, nextSongId, notice);
  }

  private maybePrefetchNext() {
    const state = usePlayerStore.getState();
    if (!Number.isFinite(this.audio.duration) || this.audio.duration <= 0) return;
    const remaining = this.audio.duration - this.audio.currentTime;
    if (remaining > 25 || remaining < 0 || state.playbackQueue.length < 2) return;
    const nextIndex = state.currentIndex < state.playbackQueue.length - 1
      ? state.currentIndex + 1
      : state.queueEndBehavior === 'repeat-queue' ? 0 : -1;
    const next = nextIndex >= 0 ? state.playbackQueue[nextIndex] : null;
    if (!next || next.offline || next.source.kind !== 'youtube' || next.source.availability !== 'available') return;
    if (this.getCachedStream(next.source.videoId)) return;

    const queueKey = state.playbackQueue.map((song) => song.id).join('\u0000');
    const prefetchKey = `${queueKey}\u0001${next.source.videoId}`;
    if (this.prefetchedKey === prefetchKey) return;
    this.prefetchedKey = prefetchKey;
    const generation = this.prefetchGeneration;
    void this.resolveTrack(
      next.source.videoId,
      'prefetch',
      () => generation === this.prefetchGeneration && this.prefetchedKey === prefetchKey,
    ).catch(() => undefined);
  }

  private isCurrentSelection(generation: number, selectionSerial: number, songId: string) {
    const state = usePlayerStore.getState();
    return generation === this.loadGeneration
      && selectionSerial === state.selectionSerial
      && state.currentSong?.id === songId;
  }

  private detachCurrentLoad() {
    this.detachLoadListeners?.();
    this.detachLoadListeners = null;
  }

  private clearAssignedSource() {
    this.detachCurrentLoad();
    this.assignedSource = null;
    this.audio.removeAttribute('src');
    this.audio.load();
  }

  public seek(time: number) {
    this.audio.currentTime = time;
    usePlayerStore.getState().setCurrentTime(time);
    void syncDiscordActivity(true);
  }

  public destroy() {
    this.loadGeneration += 1;
    this.prefetchGeneration += 1;
    this.detachCurrentLoad();
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    if (this.assignedSource) this.audio.pause();
  }
}

export const audioService = new AudioService();
