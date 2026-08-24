import { create } from 'zustand';
import { createJSONStorage, subscribeWithSelector, persist, StateStorage } from 'zustand/middleware';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  AppMode,
  DockPosition,
  isLocalSong,
  PlaybackErrorState,
  PlaybackSelectionReason,
  PlaybackStatus,
  Playlist,
  Song,
  SongSource,
  YoutubeImportTask,
} from '../types/player';
import {
  cancelYoutubeImport,
  cancelYoutubeResolve,
  detectYoutubeResource,
  getYoutubeErrorMessage,
  importYoutubePlaylist,
  resolveYoutubeTrack,
  YoutubeServiceError,
} from '../services/youtubeService';
import {
  formatLocalImportNotice,
  getLocalAudioRejection,
  selectLocalAudioFiles,
} from '../services/localImportPolicy';
import {
  cancelSpotifyMatch,
  detectSpotifyResource,
  isSpotifyUrl,
  importSpotifyResource,
  matchSpotifyTrack,
  SpotifyMatchError,
} from '../services/spotifyService';
import type {
  SpotifyImportReport,
  SpotifyImportTask,
  SpotifyPlaylistImport,
  SpotifyTrackEntry,
  SpotifyTrackMatchResult,
} from '../types/spotify';
import type { YoutubePlaylistEntry } from '../types/youtube';
import { SUNFLOWER_DEFAULT_SONG } from '../data/defaultLibrary';
import { migratePlayerPersistedState, normalizeRestoredSong } from './playerPersistence';

export interface PlayerState {
  mode: AppMode;
  prevMode: AppMode;
  dockPosition: DockPosition;
  isDrawerOpen: boolean;
  isUrlInputOpen: boolean;
  drawerTab: 'cd' | 'playlist' | 'top' | 'queue';
  cdSubTab: 'all' | 'recent' | 'favorites';
  playbackIntent: boolean;
  isPlaying: boolean;
  playbackStatus: PlaybackStatus;
  playbackError: PlaybackErrorState | null;
  playbackRetryToken: number;
  selectionSerial: number;
  selectionReason: PlaybackSelectionReason;
  isLooping: boolean;
  currentTime: number;
  resumePosition: { songId: string; time: number } | null;
  duration: number;
  volume: number;
  isMuted: boolean;
  currentSong: Song | null;
  queue: Song[];
  playbackQueue: Song[];
  currentIndex: number;
  playlists: Playlist[];
  selectedPlaylistId: string | null;
  youtubeImportTask: YoutubeImportTask | null;
  spotifyImportTask: SpotifyImportTask | null;
  topSongs: Song[];
  isAlwaysOnTop: boolean;
  isTopControlOpen: boolean;
  isSettingsOpen: boolean;
  startupMode: 'last' | AppMode;
  queueEndBehavior: 'stop' | 'repeat-queue';
  libraryNotice: string | null;
  enableDiscordRpc: boolean;
  discordClientId: string;
}

export interface PlayerActions {
  setMode: (mode: AppMode) => void;
  cycleMode: () => void;
  setDockPosition: (pos: DockPosition) => void;
  cycleDockPosition: () => void;
  toggleDrawer: () => void;
  setDrawerOpen: (isOpen: boolean) => void;
  setUrlInputOpen: (isOpen: boolean) => void;
  toggleTopControl: () => void;
  setTopControlOpen: (isOpen: boolean) => void;
  setDrawerTab: (tab: 'cd' | 'playlist' | 'top' | 'queue') => void;

  setCdSubTab: (subTab: 'all' | 'recent' | 'favorites') => void;
  setPlaybackIntent: (shouldPlay: boolean) => void;
  togglePlayPause: () => void;
  setPlaybackStatus: (status: PlaybackStatus) => void;
  setPlaybackError: (error: PlaybackErrorState | null) => void;
  requestPlaybackRetry: () => void;
  toggleLoop: () => void;
  setCurrentTime: (time: number) => void;
  checkpointPlaybackPosition: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  playSong: (song: Song, reason?: PlaybackSelectionReason) => void;
  playSongList: (songs: Song[], startIndex?: number, reason?: PlaybackSelectionReason) => void;
  playPlaylist: (playlistId: string, songId?: string) => void;
  playNext: (reason?: PlaybackSelectionReason) => void;
  playPrev: (reason?: PlaybackSelectionReason) => void;
  addToPlaybackQueue: (songId: string) => void;
  playNextFromQueue: (songId: string) => void;
  removeFromPlaybackQueue: (songId: string) => void;
  movePlaybackQueueItem: (songId: string, direction: 'up' | 'down') => void;
  shufflePlaybackQueue: () => void;
  toggleQueueRepeat: () => void;
  clearPlaybackQueue: () => void;
  addSongFromUrl: (url: string) => Promise<void>;
  importYoutubeUrl: (url: string) => Promise<void>;
  importSpotifyUrl: (url: string) => Promise<void>;
  cancelSpotifyTask: () => Promise<void>;
  retrySpotifyTask: () => Promise<void>;
  dismissSpotifyTask: () => void;
  cancelYoutubeTask: () => Promise<void>;
  retryYoutubeTask: () => Promise<void>;
  dismissYoutubeTask: () => void;
  selectPlaylist: (playlistId: string | null) => void;
  addLocalSong: (file: File) => Promise<void>;
  addMultipleLocalSongs: (files: FileList | File[]) => Promise<void>;
  updateSongMetadata: (songId: string, updates: Partial<Pick<Song, 'title' | 'artist' | 'album' | 'coverUrl'>>) => void;
  updateSongSource: (songId: string, source: SongSource) => void;
  toggleFavorite: (songId: string) => void;
  createPlaylist: (name: string) => string;
  renamePlaylist: (playlistId: string, newName: string) => void;
  toggleSongInPlaylist: (playlistId: string, songId: string) => void;
  deletePlaylist: (playlistId: string) => void;
  deleteSong: (songId: string) => Promise<void>;
  deleteMultipleSongs: (songIds: string[]) => Promise<void>;
  purgeUnavailableYoutubeSong: (songId: string, nextSongId: string | null, notice: string) => void;
  clearLibraryNotice: () => void;
  incrementPlayCount: (songId: string) => void;
  addListenedTime: (songId: string, seconds: number) => void;
  toggleAlwaysOnTop: () => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setStartupMode: (mode: 'last' | AppMode) => void;
  setQueueEndBehavior: (behavior: 'stop' | 'repeat-queue') => void;
  setEnableDiscordRpc: (enabled: boolean) => void;
  setDiscordClientId: (clientId: string) => void;
}

export type PlayerStore = PlayerState & PlayerActions;

const storageValueCache = new Map<string, string>();
let nextYoutubeImportRequestId = 1;
let activeYoutubeImportRequestId = 0;
let nextSpotifyImportRequestId = 1;
let activeSpotifyImportRequestId = 0;
const YOUTUBE_COVER_FALLBACK = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';
const SPOTIFY_IMPORT_LIMIT = 100;
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const spotifySkipReason = (reason: string) => ({
  no_candidates: 'No YouTube candidates found',
  live_unsupported: 'Live Stream tidak didukung',
  duration_mismatch: 'Candidate duration does not match',
  weak_match: 'No sufficiently close YouTube match',
  timeout: 'YouTube search timed out',
  dependency_unavailable: 'YouTube matcher is unavailable',
  process_failed: 'YouTube search failed',
}[reason] ?? 'YouTube match failed');

const createSpotifyReport = (
  playlistName: string,
  total: number,
  truncated: boolean,
): SpotifyImportReport => ({
  playlistName,
  added: 0,
  duplicates: 0,
  skipped: 0,
  processed: 0,
  total,
  truncated,
  skippedItems: [],
});

const matchedSpotifySong = (
  track: SpotifyTrackEntry,
  resource: SpotifyPlaylistImport,
  match: Extract<SpotifyTrackMatchResult, { status: 'matched' }>,
): Song => ({
  id: `spotify-${track.id}`,
  title: track.title,
  artist: track.artist,
  album: track.album || resource.title,
  coverUrl: track.cover_url
    || resource.cover_url
    || match.thumbnailUrl
    || YOUTUBE_COVER_FALLBACK,
  source: {
    kind: 'spotify',
    spotifyId: track.id,
    searchQuery: track.search_query,
    matchedVideoId: match.videoId,
    canonicalUrl: match.canonicalUrl,
  },
  duration: track.duration_seconds,
  playCount: 0,
  lastPlayed: Date.now(),
});

const isVerifiedSpotifySong = (song: Song | undefined) => song?.source.kind === 'spotify'
  && SPOTIFY_ID_PATTERN.test(song.source.spotifyId)
  && VIDEO_ID_PATTERN.test(song.source.matchedVideoId);

const waitForPlaybackResolution = async (requestId: number, getState: () => PlayerStore) => {
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  let checks = 0;
  while (
    activeSpotifyImportRequestId === requestId
    && ['resolving', 'loading'].includes(getState().playbackStatus)
    && checks < 40
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    checks++;
  }
};

const sortTopSongs = (songs: Song[]): Song[] => [...songs].sort((a, b) => {
  const durationDiff = (b.listenedSeconds || 0) - (a.listenedSeconds || 0);
  if (Math.abs(durationDiff) > 0.01) return durationDiff;
  return b.playCount - a.playCount;
});

const playlistEntryToSong = (entry: YoutubePlaylistEntry): Song => ({
  id: `yt-${entry.videoId}`,
  title: entry.title,
  artist: entry.artist,
  album: 'YouTube',
  coverUrl: entry.thumbnailUrl || YOUTUBE_COVER_FALLBACK,
  source: {
    kind: 'youtube',
    videoId: entry.videoId,
    canonicalUrl: entry.canonicalUrl,
    availability: 'available',
  },
  duration: entry.durationSeconds ?? 0,
  playCount: 0,
});
const deduplicatedLocalStorage: StateStorage = {
  getItem: (name) => {
    const value = window.localStorage.getItem(name);
    if (value !== null) storageValueCache.set(name, value);
    return value;
  },
  setItem: (name, value) => {
    if (storageValueCache.get(name) === value) return;
    window.localStorage.setItem(name, value);
    storageValueCache.set(name, value);
  },
  removeItem: (name) => {
    window.localStorage.removeItem(name);
    storageValueCache.delete(name);
  },
};

const initialSongs: Song[] = [SUNFLOWER_DEFAULT_SONG];
const initialPlaylists: Playlist[] = [];

// Helper to get audio duration automatically from local file
const getAudioDuration = (file: File): Promise<number> => {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(audio.duration) || 180);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(180);
    };
  });
};

interface ImportedAudioMetadata {
  filePath: string;
  fileHash: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  duration: number;
  coverPath?: string | null;
}

const saveAudioPermanently = async (file: File) => {
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = await invoke<ImportedAudioMetadata>('save_imported_audio', bytes, {
    headers: {
      'x-file-name': safeFileName,
    },
  });

  return {
    ...metadata,
    coverPath: metadata.coverPath ?? undefined,
    audioUrl: convertFileSrc(metadata.filePath),
    coverUrl: metadata.coverPath ? convertFileSrc(metadata.coverPath) : undefined,
  };
};

const restoreSong = (song: Song): Song => {
  const normalizedSong = normalizeRestoredSong(song);
  if (!isLocalSong(normalizedSong) || !normalizedSong.source.managed) return normalizedSong;
  return {
    ...normalizedSong,
    source: {
      ...normalizedSong.source,
      audioUrl: convertFileSrc(normalizedSong.source.filePath),
    },
    coverUrl: normalizedSong.source.coverPath
      ? convertFileSrc(normalizedSong.source.coverPath)
      : normalizedSong.coverUrl,
  };
};

const isRestorableSong = (song: Song) => {
  if (song.source.kind === 'youtube') return song.source.availability === 'available';
  if (song.source.kind === 'local') return !song.source.managed || Boolean(song.source.filePath);
  return true;
};

export const usePlayerStore = create<PlayerStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        mode: 'control-bar',
        prevMode: 'control-bar',
        dockPosition: 'free',
        isDrawerOpen: false,
        isUrlInputOpen: false,
        drawerTab: 'cd',
        cdSubTab: 'all',
        playbackIntent: false,
        isPlaying: false,
        playbackStatus: 'idle',
        playbackError: null,
        playbackRetryToken: 0,
        selectionSerial: 0,
        selectionReason: 'restore',
        isLooping: false,
        currentTime: 0,
        resumePosition: null,
        duration: 0,
        volume: 0.8,
        isMuted: false,
        currentSong: initialSongs[0],
        queue: initialSongs,
        playbackQueue: initialSongs,
        currentIndex: 0,
        playlists: initialPlaylists,
        selectedPlaylistId: null,
        youtubeImportTask: null,
        spotifyImportTask: null,
        topSongs: sortTopSongs(initialSongs),
        isAlwaysOnTop: true,
        isTopControlOpen: false,
        isSettingsOpen: false,
        startupMode: 'last',
        queueEndBehavior: 'stop',
        libraryNotice: null,
        enableDiscordRpc: true,
        discordClientId: '1534752337543954512',

        setMode: (mode) => set((state) => ({ prevMode: state.mode, mode, isUrlInputOpen: false })),
        cycleMode: () => {
          const currentMode = get().mode;
          if (currentMode === 'control-bar') set({ prevMode: 'control-bar', mode: 'vinyl-widget', isUrlInputOpen: false });
          else if (currentMode === 'vinyl-widget') set({ prevMode: 'vinyl-widget', mode: 'micro-bubble', isUrlInputOpen: false });
          else set({ prevMode: 'micro-bubble', mode: 'control-bar', isUrlInputOpen: false });
        },
        setDockPosition: (dockPosition) => set({ dockPosition }),
        cycleDockPosition: () => {
          const pos = get().dockPosition;
          if (pos === 'top-left') set({ dockPosition: 'top-right' });
          else if (pos === 'top-right') set({ dockPosition: 'bottom-right' });
          else if (pos === 'bottom-right') set({ dockPosition: 'bottom-left' });
          else if (pos === 'bottom-left') set({ dockPosition: 'free' });
          else set({ dockPosition: 'top-left' });
        },
        toggleDrawer: () => set((state) => ({
          isDrawerOpen: !state.isDrawerOpen,
          isUrlInputOpen: false,
        })),
        setDrawerOpen: (isOpen) => set({
          isDrawerOpen: isOpen,
          ...(isOpen ? { isUrlInputOpen: false } : {}),
        }),
        setUrlInputOpen: (isOpen) => set({
          isUrlInputOpen: isOpen,
          ...(isOpen ? { isDrawerOpen: false } : {}),
        }),
        toggleTopControl: () => set((state) => ({ isTopControlOpen: !state.isTopControlOpen })),
        setTopControlOpen: (isOpen) => set({ isTopControlOpen: isOpen }),
        setDrawerTab: (drawerTab) => set({ drawerTab }),
        selectPlaylist: (selectedPlaylistId) => set({ selectedPlaylistId }),

        setCdSubTab: (cdSubTab) => set({ cdSubTab }),
        setPlaybackIntent: (playbackIntent) => set({
          playbackIntent,
          ...(playbackIntent ? { playbackError: null } : {}),
        }),
        togglePlayPause: () => {
          const state = get();
          if (state.playbackError) {
            get().requestPlaybackRetry();
            return;
          }
          if (!state.currentSong) {
            const fallbackSong = state.playbackQueue[0]
              || state.queue[0]
              || state.topSongs[0]
              || (state.playlists.length > 0 && state.playlists[0].songs.length > 0
                ? state.playlists[0].songs[0]
                : null);
            if (fallbackSong) {
              get().playSong(fallbackSong);
            }
            return;
          }
          const targetIntent = !state.playbackIntent;
          set({
            playbackIntent: targetIntent,
            ...(targetIntent ? { playbackError: null } : {}),
          });
        },
        setPlaybackStatus: (playbackStatus) => set({
          playbackStatus,
          isPlaying: playbackStatus === 'playing',
          ...(playbackStatus === 'playing' ? { playbackError: null } : {}),
        }),
        setPlaybackError: (playbackError) => set({
          playbackError,
          playbackStatus: playbackError ? 'error' : 'idle',
          isPlaying: false,
        }),
        requestPlaybackRetry: () => {
          set((state) => ({
            playbackIntent: true,
            playbackError: null,
            playbackStatus: 'idle',
            playbackRetryToken: state.playbackRetryToken + 1,
          }));
        },
        toggleLoop: () => set((state) => ({ isLooping: !state.isLooping })),
        setCurrentTime: (currentTime) => set((state) => {
          const songId = state.currentSong?.id;
          const previous = state.resumePosition;
          const shouldCheckpoint = songId
            && (previous?.songId !== songId || Math.abs(currentTime - previous.time) >= 5);
          return shouldCheckpoint
            ? { currentTime, resumePosition: { songId, time: Math.max(0, currentTime) } }
            : { currentTime };
        }),
        checkpointPlaybackPosition: (time) => set((state) => ({
          currentTime: Math.max(0, time),
          resumePosition: state.currentSong
            ? { songId: state.currentSong.id, time: Math.max(0, time) }
            : null,
        })),
        setDuration: (duration) => set({ duration }),
        setVolume: (volume) => set({
          volume: Math.max(0, Math.min(1, volume > 1 ? volume / 100 : volume)),
        }),
        toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

        playSong: (song, reason = 'manual') => {
          const { playbackQueue, currentSong, currentTime, resumePosition } = get();
          const isChangingSong = currentSong?.id !== song.id;
          let nextPlaybackQueue = playbackQueue;
          let index = playbackQueue.findIndex((item) => item.id === song.id);
          if (index === -1) {
            nextPlaybackQueue = [...playbackQueue, song];
            index = nextPlaybackQueue.length - 1;
          }
          set({
            currentSong: song,
            playbackQueue: nextPlaybackQueue,
            currentIndex: index,
            currentTime: isChangingSong ? 0 : currentTime,
            resumePosition: isChangingSong ? { songId: song.id, time: 0 } : resumePosition,
            playbackIntent: true,
            playbackError: null,
            playbackStatus: 'idle',
            selectionSerial: get().selectionSerial + 1,
            selectionReason: reason,
          });
        },

        playSongList: (songs, startIndex = 0, reason = 'manual') => {
          if (songs.length === 0) return;
          const safeIndex = Math.max(0, Math.min(startIndex, songs.length - 1));
          const song = songs[safeIndex];
          set((state) => ({
            playbackQueue: [...songs],
            currentSong: song,
            currentIndex: safeIndex,
            currentTime: 0,
            resumePosition: { songId: song.id, time: 0 },
            playbackIntent: true,
            playbackError: null,
            playbackStatus: 'idle',
            selectionSerial: state.selectionSerial + 1,
            selectionReason: reason,
          }));
        },

        playPlaylist: (playlistId, songId) => {
          const playlist = get().playlists.find((item) => item.id === playlistId);
          if (!playlist || playlist.songs.length === 0) return;
          const index = songId
            ? Math.max(0, playlist.songs.findIndex((song) => song.id === songId))
            : 0;
          const song = playlist.songs[index];
          set((state) => ({
            playbackQueue: [...playlist.songs],
            currentSong: song,
            currentIndex: index,
            currentTime: 0,
            resumePosition: { songId: song.id, time: 0 },
            playbackIntent: true,
            playbackError: null,
            playbackStatus: 'idle',
            selectionSerial: state.selectionSerial + 1,
            selectionReason: 'manual',
            libraryNotice: `Memutar playlist “${playlist.name}”`,
          }));
        },

        playNext: (reason = 'sequential') => {
          const { playbackQueue, currentSong, playSong } = get();
          if (playbackQueue.length === 0) return;
          const currentIndex = currentSong
            ? playbackQueue.findIndex((item) => item.id === currentSong.id)
            : get().currentIndex;
          const safeIndex = currentIndex === -1 ? 0 : currentIndex;
          const nextIndex = (safeIndex + 1) % playbackQueue.length;
          playSong(playbackQueue[nextIndex], reason);
        },

        playPrev: (reason = 'manual') => {
          const { playbackQueue, currentSong, playSong } = get();
          if (playbackQueue.length === 0) return;
          const currentIndex = currentSong
            ? playbackQueue.findIndex((item) => item.id === currentSong.id)
            : get().currentIndex;
          const safeIndex = currentIndex === -1 ? 0 : currentIndex;
          const prevIndex = (safeIndex - 1 + playbackQueue.length) % playbackQueue.length;
          playSong(playbackQueue[prevIndex], reason);
        },

        addToPlaybackQueue: (songId) => {
          set((state) => {
            const song = state.queue.find((item) => item.id === songId);
            if (!song) return state;
            if (state.playbackQueue.some((item) => item.id === songId)) {
              return { libraryNotice: `“${song.title}” sudah ada di antrean` };
            }
            return {
              playbackQueue: [...state.playbackQueue, song],
              libraryNotice: `“${song.title}” ditambahkan ke antrean`,
            };
          });
        },

        playNextFromQueue: (songId) => {
          set((state) => {
            const song = state.queue.find((item) => item.id === songId);
            if (!song || state.currentSong?.id === songId) return state;
            const playbackQueue = state.playbackQueue.filter((item) => item.id !== songId);
            const anchorIndex = state.currentSong
              ? playbackQueue.findIndex((item) => item.id === state.currentSong?.id)
              : -1;
            playbackQueue.splice(anchorIndex + 1, 0, song);
            return {
              playbackQueue,
              currentIndex: state.currentSong
                ? Math.max(0, playbackQueue.findIndex((item) => item.id === state.currentSong?.id))
                : 0,
              libraryNotice: `“${song.title}” akan diputar berikutnya`,
            };
          });
        },

        removeFromPlaybackQueue: (songId) => {
          set((state) => {
            const song = state.playbackQueue.find((item) => item.id === songId);
            if (!song) return state;
            if (state.currentSong?.id === songId) {
              return { libraryNotice: 'Lagu yang sedang diputar tidak dapat dikeluarkan' };
            }
            const playbackQueue = state.playbackQueue.filter((item) => item.id !== songId);
            return {
              playbackQueue,
              currentIndex: state.currentSong
                ? Math.max(0, playbackQueue.findIndex((item) => item.id === state.currentSong?.id))
                : 0,
              libraryNotice: `“${song.title}” dikeluarkan dari antrean`,
            };
          });
        },

        movePlaybackQueueItem: (songId, direction) => {
          set((state) => {
            const index = state.playbackQueue.findIndex((item) => item.id === songId);
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (index < 0 || targetIndex < 0 || targetIndex >= state.playbackQueue.length) return state;
            const playbackQueue = [...state.playbackQueue];
            [playbackQueue[index], playbackQueue[targetIndex]] = [playbackQueue[targetIndex], playbackQueue[index]];
            return {
              playbackQueue,
              currentIndex: state.currentSong
                ? Math.max(0, playbackQueue.findIndex((item) => item.id === state.currentSong?.id))
                : 0,
            };
          });
        },

        shufflePlaybackQueue: () => {
          set((state) => {
            const currentSongId = state.currentSong?.id;
            const list = [...state.playbackQueue];
            if (list.length <= 1) return state;

            const currentIndex = currentSongId
              ? list.findIndex((item) => item.id === currentSongId)
              : state.currentIndex;

            const before = currentIndex > 0 ? list.slice(0, currentIndex) : [];
            const current = currentIndex >= 0 && currentIndex < list.length ? [list[currentIndex]] : [];
            const upcoming = currentIndex >= 0 ? list.slice(currentIndex + 1) : list;

            // Fisher-Yates shuffle on upcoming items
            for (let i = upcoming.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
            }

            const nextQueue = [...before, ...current, ...upcoming];
            return {
              playbackQueue: nextQueue,
              currentIndex: currentSongId ? nextQueue.findIndex((item) => item.id === currentSongId) : 0,
              libraryNotice: 'Antrean berikutnya berhasil diacak',
            };
          });
        },

        toggleQueueRepeat: () => {
          set((state) => {
            const next = state.queueEndBehavior === 'repeat-queue' ? 'stop' : 'repeat-queue';
            return {
              queueEndBehavior: next,
              libraryNotice: next === 'repeat-queue' ? 'Ulang antrean: Aktif' : 'Ulang antrean: Mati',
            };
          });
        },

        clearPlaybackQueue: () => {
          set((state) => ({
            playbackQueue: state.currentSong ? [state.currentSong] : [],
            currentIndex: 0,
            libraryNotice: 'Antrean dibersihkan',
          }));
        },

        addSongFromUrl: async (url: string) => {
          if (isSpotifyUrl(url)) {
            await get().importSpotifyUrl(url);
          } else {
            await get().importYoutubeUrl(url);
          }
        },

        importSpotifyUrl: async (url: string) => {
          const inputUrl = url.trim();
          const resource = detectSpotifyResource(inputUrl);
          const requestId = nextSpotifyImportRequestId++;
          activeSpotifyImportRequestId = requestId;
          if (!resource) {
            set({
              spotifyImportTask: null,
              libraryNotice: 'Invalid Spotify link. Use Spotify playlist, album, or track format.',
            });
            return;
          }

          set({
            spotifyImportTask: {
              requestId,
              inputUrl,
              resourceType: resource.resourceType,
              status: 'fetching',
              message: 'Mengambil metadata Spotify...',
              retryable: true,
              report: createSpotifyReport('Spotify', 0, false),
            },
          });

          try {
            const data = await importSpotifyResource(inputUrl);
            if (activeSpotifyImportRequestId !== requestId) return;
            const tracks = data.tracks.slice(0, SPOTIFY_IMPORT_LIMIT);
            const truncated = data.tracks.length > tracks.length;
            const targetPlaylistId = data.resource_type === 'track'
              ? undefined
              : `spotify-${data.resource_type}-${data.id}`;
            let report = createSpotifyReport(data.title || 'Spotify', tracks.length, truncated);
            let startedPlayback = false;

            if (tracks.length === 0) {
              set({
                spotifyImportTask: {
                  requestId,
                  inputUrl,
                  resourceType: data.resource_type,
                  status: 'error',
                  message: 'Tidak ada lagu yang ditemukan pada link Spotify ini.',
                  retryable: true,
                  report,
                },
                libraryNotice: 'Tidak ada lagu yang ditemukan pada link Spotify ini.',
              });
              return;
            }

            if (targetPlaylistId) {
              set((state) => {
                const existing = state.playlists.find((playlist) => playlist.id === targetPlaylistId);
                const draft: Playlist = existing ?? {
                  id: targetPlaylistId,
                  name: `${data.title} (Spotify)`,
                  curator: data.owner,
                  coverUrl: data.cover_url || YOUTUBE_COVER_FALLBACK,
                  songs: [],
                  source: { kind: 'spotify', spotifyId: data.id },
                };
                return {
                  playlists: existing
                    ? state.playlists.map((playlist) => playlist.id === targetPlaylistId
                      ? { ...playlist, coverUrl: data.cover_url || playlist.coverUrl }
                      : playlist)
                    : [...state.playlists, draft],
                  drawerTab: 'playlist',
                  selectedPlaylistId: targetPlaylistId,
                };
              });
            }

            set({
              spotifyImportTask: {
                requestId,
                inputUrl,
                resourceType: data.resource_type,
                status: 'matching',
                message: `Mencocokkan 0 dari ${tracks.length} lagu...`,
                retryable: true,
                targetPlaylistId,
                report,
              },
            });

            for (const track of tracks) {
              if (activeSpotifyImportRequestId !== requestId) return;
              const existingSong = get().queue.find((song) => song.id === `spotify-${track.id}`);
              let song: Song | null = existingSong && isVerifiedSpotifySong(existingSong)
                ? existingSong
                : null;
              const duplicate = song !== null;
              let skippedInCatch = false;

              if (!song) {
                let match: SpotifyTrackMatchResult;
                let matchAttempt = 0;
                for (;;) {
                  try {
                    match = await matchSpotifyTrack({
                      spotifyId: track.id,
                      title: track.title,
                      artist: track.artist,
                      durationSeconds: Math.max(1, Math.round(track.duration_seconds || 180)),
                    }, 'import');
                    if (activeSpotifyImportRequestId !== requestId) return;
                    break;
                  } catch (error) {
                    if (activeSpotifyImportRequestId !== requestId) return;
                    if (error instanceof SpotifyMatchError
                      && error.code === 'cancelled'
                      && activeSpotifyImportRequestId === requestId
                      && matchAttempt < 5) {
                      matchAttempt++;
                      await waitForPlaybackResolution(requestId, get);
                      continue;
                    }
                    const reason = error instanceof SpotifyMatchError
                      ? spotifySkipReason(error.code)
                      : 'YouTube match failed';
                    match = { status: 'skipped', spotifyId: track.id, reason: 'no_candidates' };
                    skippedInCatch = true;
                    report = {
                      ...report,
                      skipped: report.skipped + 1,
                      processed: report.processed + 1,
                      skippedItems: [...report.skippedItems, { title: track.title, reason }],
                    };
                    break;
                  }
                }

                if (match.status === 'matched') {
                  song = matchedSpotifySong(track, data, match);
                } else if (!skippedInCatch) {
                  report = {
                    ...report,
                    skipped: report.skipped + 1,
                    processed: report.processed + 1,
                    skippedItems: [
                      ...report.skippedItems,
                      { title: track.title, reason: spotifySkipReason(match.reason) },
                    ],
                  };
                }
              }

              if (song) {
                if (activeSpotifyImportRequestId !== requestId) return;
                let duplicateAtCommit = duplicate;
                set((state) => {
                  const existingAtCommit = state.queue.find((item) => item.id === song.id);
                  duplicateAtCommit = existingAtCommit !== undefined;
                  const committedSong = existingAtCommit ?? song;
                  const queue = duplicateAtCommit ? state.queue : [...state.queue, committedSong];
                  const playlists = targetPlaylistId
                    ? state.playlists.map((playlist) => playlist.id === targetPlaylistId
                      ? {
                          ...playlist,
                          songs: playlist.songs.some((item) => item.id === committedSong.id)
                            ? playlist.songs
                            : [...playlist.songs, committedSong],
                        }
                      : playlist)
                    : state.playlists;
                  const shouldStart = !startedPlayback;
                  const playbackQueue = shouldStart
                    ? [committedSong]
                    : state.playbackQueue.some((item) => item.id === committedSong.id)
                      ? state.playbackQueue
                      : [...state.playbackQueue, committedSong];
                  return {
                    queue,
                    playlists,
                    playbackQueue,
                    currentSong: shouldStart ? committedSong : state.currentSong,
                    currentIndex: shouldStart ? 0 : state.currentIndex,
                    currentTime: shouldStart ? 0 : state.currentTime,
                    resumePosition: shouldStart ? { songId: committedSong.id, time: 0 } : state.resumePosition,
                    playbackIntent: shouldStart || state.playbackIntent,
                    playbackError: shouldStart ? null : state.playbackError,
                    playbackStatus: shouldStart ? 'idle' : state.playbackStatus,
                    selectionSerial: shouldStart ? state.selectionSerial + 1 : state.selectionSerial,
                    selectionReason: shouldStart ? 'manual' : state.selectionReason,
                    topSongs: sortTopSongs(queue),
                    ...(shouldStart ? { isUrlInputOpen: false } : {}),
                  };
                });
                report = {
                  ...report,
                  added: report.added + (duplicateAtCommit ? 0 : 1),
                  duplicates: report.duplicates + (duplicateAtCommit ? 1 : 0),
                  processed: report.processed + 1,
                };
                const wasStarting = !startedPlayback;
                startedPlayback = true;
                if (wasStarting) {
                  await waitForPlaybackResolution(requestId, get);
                }
              }

              if (activeSpotifyImportRequestId !== requestId) return;
              set({
                spotifyImportTask: {
                  requestId,
                  inputUrl,
                  resourceType: data.resource_type,
                  status: 'matching',
                  message: `Mencocokkan ${report.processed} dari ${report.total} lagu...`,
                  retryable: true,
                  targetPlaylistId,
                  report,
                },
              });
            }

            if (activeSpotifyImportRequestId !== requestId) return;
            const importedCount = report.added + report.duplicates;
            const status = importedCount === 0 ? 'error' : report.skipped > 0 ? 'partial' : 'completed';
            if (targetPlaylistId && importedCount === 0) {
              set((state) => ({
                playlists: state.playlists.filter((playlist) => playlist.id !== targetPlaylistId),
                selectedPlaylistId: state.selectedPlaylistId === targetPlaylistId ? null : state.selectedPlaylistId,
              }));
            }
            set({
              spotifyImportTask: {
                requestId,
                inputUrl,
                resourceType: data.resource_type,
                status,
                message: status === 'error'
                  ? 'Tidak ada lagu Spotify yang berhasil dicocokkan.'
                  : `${report.added} lagu ditambahkan${report.skipped ? `, ${report.skipped} dilewati` : ''}.`,
                retryable: status === 'error',
                targetPlaylistId,
                report,
              },
              libraryNotice: status === 'error'
                ? 'Tidak ada lagu Spotify yang dapat diimpor.'
                : `Import Spotify selesai: ${report.added} lagu ditambahkan.`,
            });
          } catch (error: unknown) {
            if (activeSpotifyImportRequestId !== requestId) return;
            const message = error instanceof Error ? error.message : 'Failed to import from Spotify';
            set({
              spotifyImportTask: {
                requestId,
                inputUrl,
                resourceType: resource.resourceType,
                status: 'error',
                message,
                retryable: true,
                report: get().spotifyImportTask?.report ?? createSpotifyReport('Spotify', 0, false),
              },
              libraryNotice: message,
            });
          }
        },

        importYoutubeUrl: async (url: string) => {
          const inputUrl = url.trim();
          const resource = detectYoutubeResource(inputUrl);
          const requestId = nextYoutubeImportRequestId++;
          activeYoutubeImportRequestId = requestId;

          if (!resource) {
            set({
              youtubeImportTask: {
                requestId,
                inputUrl,
                kind: 'video',
                status: 'error',
                message: 'Link YouTube tidak valid atau belum didukung.',
                retryable: false,
              },
            });
            return;
          }

          set({
            youtubeImportTask: {
              requestId,
              inputUrl,
              kind: resource.kind,
              status: resource.kind === 'playlist' ? 'importing' : 'resolving',
              message: resource.kind === 'playlist'
                ? 'Membaca playlist YouTube…'
                : 'Menyiapkan audio YouTube…',
              retryable: false,
            },
          });

          try {
            if (resource.kind === 'video') {
              const track = await resolveYoutubeTrack(
                resource.videoId,
                'explicit_selection',
                () => activeYoutubeImportRequestId === requestId,
              );
              if (activeYoutubeImportRequestId !== requestId) return;

              const importedSong: Song = {
                id: `yt-${track.videoId}`,
                title: track.title,
                artist: track.artist,
                album: 'YouTube',
                coverUrl: track.thumbnailUrl || YOUTUBE_COVER_FALLBACK,
                source: {
                  kind: 'youtube',
                  videoId: track.videoId,
                  canonicalUrl: track.canonicalUrl,
                  availability: 'available',
                },
                duration: track.durationSeconds,
                playCount: 0,
                lastPlayed: Date.now(),
              };

              set((state) => {
                const existingSong = state.queue.find((song) => song.id === importedSong.id);
                const song = existingSong ?? importedSong;
                const queue = existingSong ? state.queue : [...state.queue, song];
                const playbackQueue = state.playbackQueue.some((item) => item.id === song.id)
                  ? state.playbackQueue
                  : [...state.playbackQueue, song];
                return {
                  queue,
                  playbackQueue,
                  currentSong: song,
                  currentIndex: Math.max(0, playbackQueue.findIndex((item) => item.id === song.id)),
                  currentTime: 0,
                  resumePosition: { songId: song.id, time: 0 },
                  playbackIntent: true,
                  playbackError: null,
                  playbackStatus: 'idle',
                  selectionSerial: state.selectionSerial + 1,
                  selectionReason: 'manual',
                  topSongs: sortTopSongs(queue),
                  youtubeImportTask: {
                    requestId,
                    inputUrl,
                    kind: 'video',
                    status: 'success',
                    message: existingSong
                      ? `“${song.title}” sudah tersedia.`
                      : `“${song.title}” berhasil diimpor.`,
                    retryable: false,
                    backgrounded: state.youtubeImportTask?.requestId === requestId
                      ? state.youtubeImportTask.backgrounded
                      : undefined,
                  },
                  libraryNotice: existingSong
                    ? `“${song.title}” sudah tersedia`
                    : `“${song.title}” berhasil diimpor`,
                };
              });
              return;
            }

            const result = await importYoutubePlaylist(resource.canonicalUrl);
            if (activeYoutubeImportRequestId !== requestId) return;

            set((state) => {
              const activeTask = state.youtubeImportTask?.requestId === requestId
                ? state.youtubeImportTask
                : null;
              const existingPlaylist = state.playlists.find((playlist) =>
                playlist.source?.kind === 'youtube'
                && playlist.source.playlistId === result.playlistId
              );
              const existingVideoIds = new Set(
                existingPlaylist?.songs.flatMap((song) =>
                  song.source.kind === 'youtube' ? [song.source.videoId] : []
                ) ?? [],
              );
              const seenVideoIds = new Set(existingVideoIds);
              const newEntries = result.entries.filter((entry) => {
                if (seenVideoIds.has(entry.videoId)) return false;
                seenVideoIds.add(entry.videoId);
                return true;
              });
              const duplicates = result.entries.length - newEntries.length;
              const skippedItems = result.skipped.map((item) => ({
                title: item.title || `Item #${item.position}`,
                reason: getYoutubeErrorMessage(item.reason),
              }));
              const report = {
                playlistName: result.title,
                added: newEntries.length,
                duplicates,
                skipped: result.skipped.length,
                truncated: result.truncated,
                skippedItems,
              };

              if (newEntries.length === 0) {
                const message = existingPlaylist
                  ? 'Playlist sudah tersedia.'
                  : 'Tidak ada lagu yang dapat diimpor.';
                return {
                  youtubeImportTask: {
                    requestId,
                    inputUrl,
                    kind: 'playlist',
                    status: 'success',
                    message,
                    retryable: false,
                    backgrounded: activeTask?.backgrounded,
                    targetPlaylistId: existingPlaylist?.id,
                    report,
                  },
                  libraryNotice: message,
                };
              }

              const libraryById = new Map(state.queue.map((song) => [song.id, song]));
              const importedSongs = newEntries.map(playlistEntryToSong).map((song) =>
                libraryById.get(song.id) ?? song
              );
              const addedToLibrary = importedSongs.filter((song) => !libraryById.has(song.id));
              const queue = [...state.queue, ...addedToLibrary];
              const playlistSongs = existingPlaylist
                ? [...existingPlaylist.songs, ...importedSongs]
                : importedSongs;
              const playlistId = existingPlaylist?.id ?? `yt-playlist-${result.playlistId}`;
              const nextPlaylist: Playlist = {
                id: playlistId,
                name: result.title,
                curator: 'YouTube',
                coverUrl: playlistSongs[0]?.coverUrl ?? YOUTUBE_COVER_FALLBACK,
                songs: playlistSongs,
                source: {
                  kind: 'youtube',
                  playlistId: result.playlistId,
                  canonicalUrl: result.canonicalUrl,
                },
              };
              const playlists = existingPlaylist
                ? state.playlists.map((playlist) => playlist.id === existingPlaylist.id ? nextPlaylist : playlist)
                : [...state.playlists, nextPlaylist];
              const firstSong = playlistSongs[0];
              const shouldOpenResult = activeTask?.backgrounded !== true;

              return {
                queue,
                playlists,
                playbackQueue: playlistSongs,
                currentSong: firstSong,
                currentIndex: 0,
                currentTime: 0,
                resumePosition: firstSong ? { songId: firstSong.id, time: 0 } : null,
                playbackIntent: Boolean(firstSong),
                playbackError: null,
                playbackStatus: 'idle',
                selectionSerial: state.selectionSerial + (firstSong ? 1 : 0),
                selectionReason: 'manual',
                topSongs: sortTopSongs(queue),
                isUrlInputOpen: false,
                isDrawerOpen: shouldOpenResult ? true : state.isDrawerOpen,
                drawerTab: shouldOpenResult ? 'playlist' : state.drawerTab,
                selectedPlaylistId: shouldOpenResult ? playlistId : state.selectedPlaylistId,
                youtubeImportTask: {
                  requestId,
                  inputUrl,
                  kind: 'playlist',
                  status: 'success',
                  message: existingPlaylist
                    ? `${newEntries.length} lagu baru ditambahkan.`
                    : `Playlist “${result.title}” berhasil diimpor.`,
                  retryable: false,
                  backgrounded: activeTask?.backgrounded,
                  targetPlaylistId: playlistId,
                  report,
                },
                libraryNotice: existingPlaylist
                  ? `${newEntries.length} lagu baru ditambahkan ke “${result.title}”`
                  : `Playlist “${result.title}” berhasil diimpor`,
              };
            });
          } catch (error) {
            if (activeYoutubeImportRequestId !== requestId) return;
            const mapped = error instanceof YoutubeServiceError ? error : null;
            const activeTask = get().youtubeImportTask?.requestId === requestId
              ? get().youtubeImportTask
              : null;
            set({
              youtubeImportTask: {
                requestId,
                inputUrl,
                kind: resource.kind,
                status: mapped?.code === 'cancelled' ? 'cancelled' : 'error',
                message: mapped?.message ?? 'Gagal memproses link YouTube.',
                retryable: mapped?.retryable ?? true,
                backgrounded: activeTask?.backgrounded,
              },
              libraryNotice: mapped?.message ?? 'Gagal memproses link YouTube.',
            });
          }
        },

        cancelSpotifyTask: async () => {
          const task = get().spotifyImportTask;
          if (!task || !['fetching', 'matching'].includes(task.status)) return;
          activeSpotifyImportRequestId = nextSpotifyImportRequestId++;
          set({
            spotifyImportTask: {
              ...task,
              status: 'cancelled',
              message: 'Import Spotify dibatalkan. Lagu yang sudah cocok tetap tersimpan.',
              retryable: true,
            },
          });
          try {
            await cancelSpotifyMatch();
          } catch {
            // The request-id guard prevents stale results from being committed.
          }
        },

        retrySpotifyTask: async () => {
          const task = get().spotifyImportTask;
          if (!task) return;
          set({ isUrlInputOpen: true });
          await get().importSpotifyUrl(task.inputUrl);
        },

        dismissSpotifyTask: () => {
          const task = get().spotifyImportTask;
          if (!task || ['fetching', 'matching'].includes(task.status)) return;
          set({ spotifyImportTask: null, isUrlInputOpen: false });
        },

        cancelYoutubeTask: async () => {
          const task = get().youtubeImportTask;
          if (!task || !['importing', 'resolving'].includes(task.status)) return;
          activeYoutubeImportRequestId = nextYoutubeImportRequestId++;
          set({
            youtubeImportTask: {
              ...task,
              status: 'cancelled',
              message: 'Proses YouTube dibatalkan.',
              retryable: true,
            },
          });
          try {
            if (task.kind === 'playlist') await cancelYoutubeImport();
            else await cancelYoutubeResolve();
          } catch {
            // Stale-result guards still prevent a cancelled task from committing.
          }
        },

        retryYoutubeTask: async () => {
          const task = get().youtubeImportTask;
          if (!task) return;
          set({ isUrlInputOpen: true });
          await get().importYoutubeUrl(task.inputUrl);
        },

        dismissYoutubeTask: () => {
          set((state) => {
            const task = state.youtubeImportTask;
            if (!task) return { isUrlInputOpen: false };
            if (task.status === 'importing' || task.status === 'resolving') {
              return {
                isUrlInputOpen: false,
                youtubeImportTask: { ...task, backgrounded: true },
              };
            }
            return { isUrlInputOpen: false, youtubeImportTask: null };
          });
        },

        addLocalSong: async (file: File) => {
          const rejection = getLocalAudioRejection(file);
          if (rejection) {
            set({ libraryNotice: `“${file.name}” ditolak: ${rejection}` });
            return;
          }
          let savedAudio;
          try {
            savedAudio = await saveAudioPermanently(file);
          } catch {
            set({ libraryNotice: `“${file.name}” bukan file audio yang valid` });
            return;
          }
          const existingSong = get().queue.find((song) =>
            isLocalSong(song) && (
              song.source.fileHash === savedAudio.fileHash
              || song.source.filePath === savedAudio.filePath
            )
          );
          if (existingSong) {
            const currentPlaybackQueue = get().playbackQueue;
            const playbackQueue = currentPlaybackQueue.some((song) => song.id === existingSong.id)
              ? currentPlaybackQueue
              : [...currentPlaybackQueue, existingSong];
            set((state) => ({
              playbackQueue,
              currentSong: existingSong,
              currentIndex: Math.max(0, playbackQueue.findIndex((song) => song.id === existingSong.id)),
              currentTime: 0,
              resumePosition: { songId: existingSong.id, time: 0 },
              playbackIntent: true,
              playbackError: null,
              playbackStatus: 'idle',
              selectionSerial: state.selectionSerial + 1,
              selectionReason: 'manual',
              libraryNotice: `“${existingSong.title}” sudah ada di library`,
            }));
            return;
          }

          const realDuration = savedAudio.duration || await getAudioDuration(file);
          const cleanName = file.name.replace(/\.[^/.]+$/, "");

          const newSong: Song = {
            id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            title: savedAudio.title || cleanName,
            artist: savedAudio.artist || 'Local Music File',
            album: savedAudio.album || 'My Local Library',
            coverUrl: savedAudio.coverUrl || 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
            source: {
              kind: 'local',
              audioUrl: savedAudio.audioUrl,
              filePath: savedAudio.filePath,
              fileHash: savedAudio.fileHash,
              coverPath: savedAudio.coverPath,
              managed: true,
            },
            duration: realDuration,
            playCount: 0,
            lastPlayed: Date.now(),
          };

          set((state) => {
            const updatedQueue = [...state.queue, newSong];
            const playbackQueue = [...state.playbackQueue, newSong];
            const updatedTop = sortTopSongs(updatedQueue);
            return {
              queue: updatedQueue,
              playbackQueue,
              currentSong: newSong,
              currentIndex: playbackQueue.length - 1,
              currentTime: 0,
              resumePosition: { songId: newSong.id, time: 0 },
              playbackIntent: true,
              playbackError: null,
              playbackStatus: 'idle',
              selectionSerial: state.selectionSerial + 1,
              selectionReason: 'manual',
              topSongs: updatedTop
            };
          });
        },

        addMultipleLocalSongs: async (files: FileList | File[]) => {
          const selection = selectLocalAudioFiles(Array.from(files));
          const newSongs: Song[] = [];
          const localSources = get().queue.filter(isLocalSong).map((song) => song.source);
          const knownHashes = new Set(localSources.map((source) => source.fileHash).filter(Boolean));
          const knownPaths = new Set(localSources.map((source) => source.filePath));
          let duplicateCount = 0;
          let rejectedCount = selection.rejectedCount;

          for (const file of selection.accepted) {
            try {
              const savedAudio = await saveAudioPermanently(file);
              if (knownHashes.has(savedAudio.fileHash) || knownPaths.has(savedAudio.filePath)) {
                duplicateCount += 1;
                continue;
              }
              knownHashes.add(savedAudio.fileHash);
              knownPaths.add(savedAudio.filePath);

              const realDuration = savedAudio.duration || await getAudioDuration(file);
              const cleanName = file.name.replace(/\.[^/.]+$/, "");

              newSongs.push({
                id: `local-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                title: savedAudio.title || cleanName,
                artist: savedAudio.artist || 'Local Audio',
                album: savedAudio.album || 'My Local Library',
                coverUrl: savedAudio.coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
                source: {
                  kind: 'local',
                  audioUrl: savedAudio.audioUrl,
                  filePath: savedAudio.filePath,
                  fileHash: savedAudio.fileHash,
                  coverPath: savedAudio.coverPath,
                  managed: true,
                },
                duration: realDuration,
                playCount: 0,
                lastPlayed: Date.now(),
              });
            } catch (error) {
              console.error(`Gagal menyimpan ${file.name}:`, error);
              rejectedCount += 1;
            }
          }

          if (newSongs.length === 0) {
            set({ libraryNotice: formatLocalImportNotice(0, duplicateCount, rejectedCount) });
            return;
          }

          set((state) => {
            const updatedQueue = [...state.queue, ...newSongs];
            const playbackQueue = [...state.playbackQueue, ...newSongs];
            const updatedTop = sortTopSongs(updatedQueue);
            return {
              queue: updatedQueue,
              playbackQueue,
              currentSong: newSongs[0],
              currentIndex: state.playbackQueue.length,
              currentTime: 0,
              resumePosition: { songId: newSongs[0].id, time: 0 },
              playbackIntent: true,
              playbackError: null,
              playbackStatus: 'idle',
              selectionSerial: state.selectionSerial + 1,
              selectionReason: 'manual',
              topSongs: updatedTop,
              libraryNotice: formatLocalImportNotice(newSongs.length, duplicateCount, rejectedCount),
            };
          });
        },

        updateSongMetadata: (songId, updates) => {
          const updateSong = (song: Song): Song => song.id === songId
            ? { ...song, ...updates }
            : song;

          set((state) => {
            const queue = state.queue.map(updateSong);
            return {
              queue,
              playbackQueue: state.playbackQueue.map(updateSong),
              currentSong: state.currentSong ? updateSong(state.currentSong) : null,
              playlists: state.playlists.map((playlist) => ({
                ...playlist,
                songs: playlist.songs.map(updateSong),
              })),
              topSongs: sortTopSongs(queue),
              libraryNotice: (updates.title || updates.artist || updates.album) ? 'Song metadata updated successfully' : state.libraryNotice,
            };
          });
        },

        updateSongSource: (songId, source) => {
          const updateSong = (song: Song): Song => song.id === songId
            ? { ...song, source }
            : song;

          set((state) => {
            const queue = state.queue.map(updateSong);
            return {
              queue,
              playbackQueue: state.playbackQueue.map(updateSong),
              currentSong: state.currentSong ? updateSong(state.currentSong) : null,
              playlists: state.playlists.map((playlist) => ({
                ...playlist,
                songs: playlist.songs.map(updateSong),
              })),
              topSongs: sortTopSongs(queue),
            };
          });
        },

        toggleFavorite: (songId) => {
          const toggleSong = (song: Song): Song => song.id === songId
            ? { ...song, isFavorite: !song.isFavorite }
            : song;

          set((state) => {
            const queue = state.queue.map(toggleSong);
            const changedSong = queue.find((song) => song.id === songId);
            return {
              queue,
              playbackQueue: state.playbackQueue.map(toggleSong),
              currentSong: state.currentSong ? toggleSong(state.currentSong) : null,
              playlists: state.playlists.map((playlist) => ({
                ...playlist,
                songs: playlist.songs.map(toggleSong),
              })),
              topSongs: sortTopSongs(queue),
              libraryNotice: changedSong?.isFavorite
                ? `“${changedSong.title}” added to Favorites`
                : `“${changedSong?.title ?? 'Song'}” removed from Favorites`,
            };
          });
        },

        createPlaylist: (name) => {
          const cleanName = name.trim();
          const playlistId = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          if (!cleanName) return playlistId;

          set((state) => ({
            playlists: [
              ...state.playlists,
              {
                id: playlistId,
                name: cleanName,
                curator: 'Miles',
                coverUrl: state.queue[0]?.coverUrl ?? initialSongs[0].coverUrl,
                songs: [],
                source: { kind: 'local' },
              },
            ],
            libraryNotice: `Playlist “${cleanName}” created`,
          }));
          return playlistId;
        },

        renamePlaylist: (playlistId, newName) => {
          const cleanName = newName.trim();
          if (!cleanName) return;

          set((state) => {
            const playlist = state.playlists.find((item) => item.id === playlistId);
            if (!playlist) return state;

            return {
              playlists: state.playlists.map((item) =>
                item.id === playlistId ? { ...item, name: cleanName } : item
              ),
              libraryNotice: `Playlist renamed to “${cleanName}”`,
            };
          });
        },

        toggleSongInPlaylist: (playlistId, songId) => {
          set((state) => {
            const song = state.queue.find((item) => item.id === songId);
            if (!song) return state;

            let notice = '';
            const playlists = state.playlists.map((playlist) => {
              if (playlist.id !== playlistId) return playlist;
              const alreadyAdded = playlist.songs.some((item) => item.id === songId);
              const songs = alreadyAdded
                ? playlist.songs.filter((item) => item.id !== songId)
                : [...playlist.songs, song];
              notice = alreadyAdded
                ? `“${song.title}” removed from ${playlist.name}`
                : `“${song.title}” added to ${playlist.name}`;
              return {
                ...playlist,
                songs,
                coverUrl: songs[0]?.coverUrl ?? playlist.coverUrl,
              };
            });

            return { playlists, libraryNotice: notice || state.libraryNotice };
          });
        },

        deletePlaylist: (playlistId) => {
          set((state) => {
            const playlist = state.playlists.find((item) => item.id === playlistId);
            if (!playlist) return state;
            return {
              playlists: state.playlists.filter((item) => item.id !== playlistId),
              selectedPlaylistId: state.selectedPlaylistId === playlistId ? null : state.selectedPlaylistId,
              libraryNotice: `Playlist “${playlist.name}” deleted`,
            };
          });
        },

        deleteSong: async (songId) => {
          const state = get();
          const song = state.queue.find((item) => item.id === songId);
          if (!song) return;

          const localSource = isLocalSong(song) ? song.source : null;
          const sharedFile = localSource?.managed === true
            && state.queue.some((item) => isLocalSong(item)
              && item.id !== songId
              && item.source.filePath === localSource.filePath);
          const sharedCover = localSource?.managed === true
            && localSource.coverPath
            && state.queue.some((item) => isLocalSong(item)
              && item.id !== songId
              && item.source.coverPath === localSource.coverPath);

          try {
            if (localSource?.managed) {
              await invoke('delete_library_song', {
                filePath: sharedFile ? null : localSource.filePath,
                coverPath: sharedCover ? null : localSource.coverPath ?? null,
              });
            }
          } catch (error) {
            console.error(`Failed to delete ${song.title}:`, error);
            set({ libraryNotice: `Failed to delete “${song.title}”` });
            return;
          }

          set((currentState) => {
            const queue = currentState.queue.filter((item) => item.id !== songId);
            const playbackQueue = currentState.playbackQueue.filter((item) => item.id !== songId);
            const deletedCurrentSong = currentState.currentSong?.id === songId;
            const currentSong = deletedCurrentSong
              ? playbackQueue[Math.min(currentState.currentIndex, Math.max(0, playbackQueue.length - 1))] ?? null
              : currentState.currentSong;
            const currentIndex = currentSong
              ? Math.max(0, playbackQueue.findIndex((item) => item.id === currentSong.id))
              : 0;

            return {
              queue,
              playbackQueue,
              currentSong,
              currentIndex,
              currentTime: deletedCurrentSong ? 0 : currentState.currentTime,
              resumePosition: deletedCurrentSong
                ? (currentSong ? { songId: currentSong.id, time: 0 } : null)
                : currentState.resumePosition,
              playbackIntent: deletedCurrentSong ? false : currentState.playbackIntent,
              playbackError: deletedCurrentSong ? null : currentState.playbackError,
              selectionSerial: deletedCurrentSong
                ? currentState.selectionSerial + 1
                : currentState.selectionSerial,
              selectionReason: deletedCurrentSong ? 'manual' : currentState.selectionReason,
              playlists: currentState.playlists.map((playlist) => {
                const songs = playlist.songs.filter((item) => item.id !== songId);
                return {
                  ...playlist,
                  songs,
                  coverUrl: songs[0]?.coverUrl ?? playlist.coverUrl,
                };
              }),
              topSongs: sortTopSongs(queue),
              libraryNotice: `“${song.title}” removed from library`,
            };
          });
        },

        deleteMultipleSongs: async (songIds: string[]) => {
          if (songIds.length === 0) return;
          const targetIds = new Set(songIds);
          const state = get();
          const targetSongs = state.queue.filter((item) => targetIds.has(item.id));
          if (targetSongs.length === 0) return;

          // Delete managed local files
          for (const song of targetSongs) {
            if (isLocalSong(song) && song.source.managed) {
              try {
                const localSource = song.source;
                const sharedFile = state.queue.some((item) => isLocalSong(item)
                  && !targetIds.has(item.id)
                  && item.source.filePath === localSource.filePath);
                const sharedCover = localSource.coverPath
                  && state.queue.some((item) => isLocalSong(item)
                    && !targetIds.has(item.id)
                    && item.source.coverPath === localSource.coverPath);
                await invoke('delete_library_song', {
                  filePath: sharedFile ? null : localSource.filePath,
                  coverPath: sharedCover ? null : localSource.coverPath ?? null,
                });
              } catch (err) {
                console.error(`Failed to delete local files for ${song.title}:`, err);
              }
            }
          }

          set((currentState) => {
            const queue = currentState.queue.filter((item) => !targetIds.has(item.id));
            const playbackQueue = currentState.playbackQueue.filter((item) => !targetIds.has(item.id));
            const deletedCurrent = currentState.currentSong && targetIds.has(currentState.currentSong.id);
            const currentSong = deletedCurrent
              ? playbackQueue[Math.min(currentState.currentIndex, Math.max(0, playbackQueue.length - 1))] ?? null
              : currentState.currentSong;
            const currentIndex = currentSong
              ? Math.max(0, playbackQueue.findIndex((item) => item.id === currentSong.id))
              : 0;

            return {
              queue,
              playbackQueue,
              currentSong,
              currentIndex,
              currentTime: deletedCurrent ? 0 : currentState.currentTime,
              resumePosition: deletedCurrent
                ? (currentSong ? { songId: currentSong.id, time: 0 } : null)
                : currentState.resumePosition,
              playbackIntent: deletedCurrent ? false : currentState.playbackIntent,
              playbackError: deletedCurrent ? null : currentState.playbackError,
              selectionSerial: deletedCurrent
                ? currentState.selectionSerial + 1
                : currentState.selectionSerial,
              selectionReason: deletedCurrent ? 'manual' : currentState.selectionReason,
              playlists: currentState.playlists.map((playlist) => {
                const songs = playlist.songs.filter((item) => !targetIds.has(item.id));
                return {
                  ...playlist,
                  songs,
                  coverUrl: songs[0]?.coverUrl ?? playlist.coverUrl,
                };
              }),
              topSongs: sortTopSongs(queue),
              libraryNotice: `${targetSongs.length} lagu berhasil dihapus`,
            };
          });
        },

        purgeUnavailableYoutubeSong: (songId, nextSongId, notice) => {
          set((state) => {
            const removedSong = state.queue.find((song) => song.id === songId);
            if (!removedSong || removedSong.source.kind !== 'youtube') return state;

            const queue = state.queue.filter((song) => song.id !== songId);
            const playbackQueue = state.playbackQueue.filter((song) => song.id !== songId);
            const playlists = state.playlists.map((playlist) => {
              const songs = playlist.songs.filter((song) => song.id !== songId);
              return {
                ...playlist,
                songs,
                coverUrl: songs[0]?.coverUrl ?? YOUTUBE_COVER_FALLBACK,
              };
            });
            const removedCurrentSong = state.currentSong?.id === songId;
            const nextSong = removedCurrentSong && nextSongId
              ? playbackQueue.find((song) => song.id === nextSongId)
                ?? queue.find((song) => song.id === nextSongId)
                ?? null
              : null;
            const nextPlaybackQueue = nextSong && !playbackQueue.some((song) => song.id === nextSong.id)
              ? [nextSong, ...playbackQueue]
              : playbackQueue;
            const currentSong = removedCurrentSong ? nextSong : state.currentSong;
            const currentIndex = currentSong
              ? Math.max(0, nextPlaybackQueue.findIndex((song) => song.id === currentSong.id))
              : 0;

            return {
              queue,
              playbackQueue: nextPlaybackQueue,
              playlists,
              currentSong,
              currentIndex,
              currentTime: removedCurrentSong ? 0 : state.currentTime,
              duration: removedCurrentSong ? currentSong?.duration ?? 0 : state.duration,
              resumePosition: removedCurrentSong
                ? (currentSong ? { songId: currentSong.id, time: 0 } : null)
                : state.resumePosition,
              playbackIntent: removedCurrentSong ? Boolean(currentSong) : state.playbackIntent,
              playbackStatus: removedCurrentSong ? 'idle' : state.playbackStatus,
              isPlaying: removedCurrentSong ? false : state.isPlaying,
              playbackError: removedCurrentSong && !currentSong
                ? { songId, message: 'Tidak ada lagu yang dapat diputar.', retryable: false }
                : state.playbackError,
              selectionSerial: removedCurrentSong ? state.selectionSerial + 1 : state.selectionSerial,
              selectionReason: removedCurrentSong ? 'auto_skip' : state.selectionReason,
              topSongs: sortTopSongs(queue),
              libraryNotice: notice,
            };
          });
        },

        clearLibraryNotice: () => set({ libraryNotice: null }),

        incrementPlayCount: (songId: string) => {
          set((state) => {
            const updateSong = (song: Song): Song => {
              if (song.id === songId) {
                return {
                  ...song,
                  playCount: song.playCount + 1,
                  lastPlayed: Date.now(),
                };
              }
              return song;
            };
            const updatedQueue = state.queue.map(updateSong);

            return {
              queue: updatedQueue,
              playbackQueue: state.playbackQueue.map(updateSong),
              playlists: state.playlists.map((playlist) => ({
                ...playlist,
                songs: playlist.songs.map(updateSong),
              })),
              topSongs: sortTopSongs(updatedQueue),
              currentSong: state.currentSong ? updateSong(state.currentSong) : null,
            };
          });
        },

        addListenedTime: (songId: string, seconds: number) => {
          if (!seconds || seconds <= 0) return;
          set((state) => {
            const updateSong = (song: Song): Song => {
              if (song.id === songId) {
                return {
                  ...song,
                  listenedSeconds: (song.listenedSeconds || 0) + seconds,
                };
              }
              return song;
            };
            const updatedQueue = state.queue.map(updateSong);

            return {
              queue: updatedQueue,
              playbackQueue: state.playbackQueue.map(updateSong),
              playlists: state.playlists.map((playlist) => ({
                ...playlist,
                songs: playlist.songs.map(updateSong),
              })),
              topSongs: sortTopSongs(updatedQueue),
              currentSong: state.currentSong ? updateSong(state.currentSong) : null,
            };
          });
        },

        toggleAlwaysOnTop: () => set((state) => ({ isAlwaysOnTop: !state.isAlwaysOnTop })),
        setAlwaysOnTop: (isAlwaysOnTop) => set({ isAlwaysOnTop }),
        setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
        setStartupMode: (startupMode) => set({ startupMode }),
        setQueueEndBehavior: (queueEndBehavior) => set({ queueEndBehavior }),
        setEnableDiscordRpc: (enableDiscordRpc) => set({ enableDiscordRpc }),
        setDiscordClientId: (discordClientId) => set({ discordClientId }),
      }),
      {
        name: 'aura_music_player_storage',
        version: 6,
        migrate: migratePlayerPersistedState,
        merge: (persistedState, currentState) => {
          const savedState = persistedState as Partial<PlayerStore>;
          const queue = (savedState.queue ?? currentState.queue)
            .filter(isRestorableSong)
            .map(restoreSong);
          const playlists = (savedState.playlists ?? currentState.playlists).map((playlist) => ({
            ...playlist,
            songs: playlist.songs.filter(isRestorableSong).map(restoreSong),
          }));
          const restoredCurrentSong = savedState.currentSong && isRestorableSong(savedState.currentSong)
            ? restoreSong(savedState.currentSong)
            : null;
          const currentSong = queue.find((song) => song.id === restoredCurrentSong?.id)
            ?? queue[0]
            ?? null;
          let playbackQueue = (savedState.playbackQueue ?? queue)
            .map((song) => queue.find((item) => item.id === song.id))
            .filter((song): song is Song => Boolean(song));
          if (currentSong && !playbackQueue.some((song) => song.id === currentSong.id)) {
            playbackQueue = [currentSong, ...playbackQueue];
          }
          const currentIndex = currentSong
            ? Math.max(0, playbackQueue.findIndex((song) => song.id === currentSong.id))
            : 0;
          const resumePosition = currentSong
            && savedState.resumePosition?.songId === currentSong.id
            && Number.isFinite(savedState.resumePosition.time)
            ? { songId: currentSong.id, time: Math.max(0, savedState.resumePosition.time) }
            : null;
          const startupMode = savedState.startupMode ?? currentState.startupMode;
          const mode = startupMode === 'last'
            ? savedState.mode ?? currentState.mode
            : startupMode;

          return {
            ...currentState,
            ...savedState,
            queue,
            playbackQueue,
            playlists,
            currentSong,
            currentIndex,
            currentTime: resumePosition?.time ?? 0,
            resumePosition,
            mode,
            startupMode,
            isSettingsOpen: false,
            isUrlInputOpen: false,
            duration: currentSong?.duration ?? 0,
            playbackIntent: false,
            isPlaying: false,
            playbackStatus: 'idle',
            playbackError: null,
            selectionReason: 'restore',
            youtubeImportTask: null,
            spotifyImportTask: null,
            topSongs: [...queue].sort((a, b) => b.playCount - a.playCount),
          };
        },
        partialize: (state) => {
          const queue = state.queue.filter(isRestorableSong);
          const persistedIds = new Set(queue.map((song) => song.id));
          const playbackQueue = state.playbackQueue.filter((song) => persistedIds.has(song.id));
          const currentSong = state.currentSong && persistedIds.has(state.currentSong.id)
            ? state.currentSong
            : null;
          return {
            queue,
            playbackQueue,
            playlists: state.playlists
              .map((playlist) => ({
                ...playlist,
                songs: playlist.songs.filter((song) => persistedIds.has(song.id)),
              }))
              .filter((playlist) => playlist.source?.kind !== 'spotify' || playlist.songs.length > 0),
            volume: state.volume,
            isMuted: state.isMuted,
            isLooping: state.isLooping,
            mode: state.mode,
            startupMode: state.startupMode,
            queueEndBehavior: state.queueEndBehavior,
            isAlwaysOnTop: state.isAlwaysOnTop,
            enableDiscordRpc: state.enableDiscordRpc,
            discordClientId: state.discordClientId,
            currentSong,
            currentIndex: currentSong
              ? Math.max(0, playbackQueue.findIndex((song) => song.id === currentSong.id))
              : 0,
            resumePosition: currentSong?.id === state.resumePosition?.songId
              ? state.resumePosition
              : null,
          };
        },
        storage: createJSONStorage(() => deduplicatedLocalStorage),
      }
    )
  )
);
