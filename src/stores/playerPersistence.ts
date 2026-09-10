import type {
  LocalSongSource,
  OfflineInfo,
  Playlist,
  Song,
  SpotifySongSource,
  YoutubeAvailability,
  YoutubeSongSource,
} from '../types/player';
import {
  LEGACY_DEFAULT_PLAYLIST_IDS,
  LEGACY_DEFAULT_SONG_IDS,
  SUNFLOWER_DEFAULT_SONG,
} from '../data/defaultLibrary';

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,80}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const YOUTUBE_AVAILABILITY = new Set<YoutubeAvailability>([
  'available',
  'unavailable',
  'live_unsupported',
  'upcoming_unsupported',
]);

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const optionalString = (value: unknown) => typeof value === 'string' && value.length > 0
  ? value
  : undefined;

const validNumber = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const normalizeRestoredSong = (song: Song): Song => song;

const extractYoutubeVideoId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const candidate = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : YOUTUBE_HOSTS.has(host)
        ? (url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.split('/').filter(Boolean)[1])
        : null;
    return candidate && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
};

const migrateSource = (song: UnknownRecord): LocalSongSource | YoutubeSongSource | SpotifySongSource | null => {
  const source = isRecord(song.source) ? song.source : null;
  if (source?.kind === 'youtube') {
    const videoId = optionalString(source.videoId);
    if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) return null;
    const availability = YOUTUBE_AVAILABILITY.has(source.availability as YoutubeAvailability)
      ? source.availability as YoutubeAvailability
      : 'available';
    return {
      kind: 'youtube',
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      availability,
    };
  }
  if (source?.kind === 'local') {
    const filePath = optionalString(source.filePath);
    const audioUrl = optionalString(source.audioUrl);
    if (!filePath || !audioUrl) return null;
    return {
      kind: 'local',
      filePath,
      audioUrl,
      fileHash: optionalString(source.fileHash),
      coverPath: optionalString(source.coverPath),
      managed: source.managed === true,
    };
  }
  if (source?.kind === 'spotify') {
    const spotifyId = optionalString(source.spotifyId);
    const matchedVideoId = optionalString(source.matchedVideoId);
    const searchQuery = optionalString(source.searchQuery);
    if (!spotifyId || !SPOTIFY_ID_PATTERN.test(spotifyId)
      || !matchedVideoId || !VIDEO_ID_PATTERN.test(matchedVideoId)
      || !searchQuery || searchQuery.length > 320 || /[\u0000-\u001F\u007F]/.test(searchQuery)) {
      return null;
    }
    return {
      kind: 'spotify',
      spotifyId,
      searchQuery,
      matchedVideoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${matchedVideoId}`,
    };
  }

  const legacyYoutubeUrl = optionalString(song.youtubeUrl);
  if (legacyYoutubeUrl) {
    const videoId = extractYoutubeVideoId(legacyYoutubeUrl);
    return videoId
      ? {
          kind: 'youtube',
          videoId,
          canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
          availability: 'available',
        }
      : null;
  }

  const audioUrl = optionalString(song.audioUrl);
  const filePath = optionalString(song.filePath) ?? audioUrl;
  if (!audioUrl || !filePath) return null;
  return {
    kind: 'local',
    audioUrl,
    filePath,
    fileHash: optionalString(song.fileHash),
    coverPath: optionalString(song.coverPath),
    managed: song.isLocal === true && typeof song.filePath === 'string',
  };
};

const migrateOffline = (value: UnknownRecord): OfflineInfo | undefined => {
  const offline = isRecord(value.offline) ? value.offline : null;
  if (!offline) return undefined;
  const filePath = optionalString(offline.filePath);
  const fileHash = optionalString(offline.fileHash);
  if (!filePath || !fileHash) return undefined;
  return {
    filePath,
    fileHash,
    coverPath: optionalString(offline.coverPath),
    remoteCoverUrl: optionalString(offline.remoteCoverUrl),
  };
};

export const migrateSongToV2 = (value: unknown): Song | null => {
  if (!isRecord(value)) return null;
  const id = optionalString(value.id);
  const title = optionalString(value.title);
  const artist = optionalString(value.artist);
  const coverUrl = optionalString(value.coverUrl);
  const source = migrateSource(value);
  if (!id || !title || !artist || !coverUrl || !source) return null;

  return normalizeRestoredSong({
    id,
    title,
    artist,
    album: optionalString(value.album),
    coverUrl,
    source,
    duration: Math.max(0, validNumber(value.duration, 0)),
    isFavorite: value.isFavorite === true || undefined,
    playCount: Math.max(0, validNumber(value.playCount, 0)),
    listenedSeconds: Math.max(0, validNumber(value.listenedSeconds, 0)),
    lastPlayed: typeof value.lastPlayed === 'number' && Number.isFinite(value.lastPlayed)
      ? value.lastPlayed
      : undefined,
    offline: migrateOffline(value),
  });
};

const migrateSongList = (value: unknown) => Array.isArray(value)
  ? value.map(migrateSongToV2).filter((song): song is Song => song !== null)
  : [];

const migratePlaylists = (value: unknown, libraryById: Map<string, Song>): Playlist[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = optionalString(item.id);
    const name = optionalString(item.name);
    const curator = optionalString(item.curator);
    const coverUrl = optionalString(item.coverUrl);
    if (!id || !name || !curator || !coverUrl) return [];
    const songIds = migrateSongList(item.songs).map((song) => song.id);
    const rawSource = isRecord(item.source) ? item.source : null;
    const youtubePlaylistId = rawSource?.kind === 'youtube'
      ? optionalString(rawSource.playlistId)
      : undefined;
    const spotifyPlaylistId = rawSource?.kind === 'spotify'
      ? optionalString(rawSource.spotifyId)
      : undefined;
    const source = youtubePlaylistId && PLAYLIST_ID_PATTERN.test(youtubePlaylistId)
      ? {
          kind: 'youtube' as const,
          playlistId: youtubePlaylistId,
          canonicalUrl: `https://www.youtube.com/playlist?list=${youtubePlaylistId}`,
        }
      : spotifyPlaylistId && SPOTIFY_ID_PATTERN.test(spotifyPlaylistId)
        ? { kind: 'spotify' as const, spotifyId: spotifyPlaylistId }
        : { kind: 'local' as const };
    const songs = songIds.flatMap((songId) => libraryById.get(songId) ?? []);
    return [{
      id,
      name,
      curator,
      coverUrl: songs[0]?.coverUrl || coverUrl,
      songs,
      isPinned: item.isPinned === true || undefined,
      source,
    }];
  });
};

export const migratePlayerPersistedState = (persistedState: unknown, _version: number): unknown => {
  if (!isRecord(persistedState)) return persistedState;
  const restoredQueue = migrateSongList(persistedState.queue)
    .filter((song) => !LEGACY_DEFAULT_SONG_IDS.has(song.id));
  const queue = restoredQueue.some((song) => song.id === SUNFLOWER_DEFAULT_SONG.id)
    ? restoredQueue
    : [SUNFLOWER_DEFAULT_SONG, ...restoredQueue];
  const libraryById = new Map(queue.map((song) => [song.id, song]));
  const playbackIds = migrateSongList(persistedState.playbackQueue)
    .filter((song) => !LEGACY_DEFAULT_SONG_IDS.has(song.id))
    .map((song) => song.id);
  const playbackQueue = playbackIds.flatMap((id) => libraryById.get(id) ?? []);
  const playlists = migratePlaylists(persistedState.playlists, libraryById)
    .filter((playlist) => !LEGACY_DEFAULT_PLAYLIST_IDS.has(playlist.id));
  const currentId = migrateSongToV2(persistedState.currentSong)?.id;
  const currentSong = currentId && !LEGACY_DEFAULT_SONG_IDS.has(currentId)
    ? libraryById.get(currentId) ?? null
    : SUNFLOWER_DEFAULT_SONG;
  const currentSongId = currentSong?.id;
  const resume = isRecord(persistedState.resumePosition)
    && currentSongId
    && persistedState.resumePosition.songId === currentSongId
    && typeof persistedState.resumePosition.time === 'number'
    && Number.isFinite(persistedState.resumePosition.time)
    ? { songId: currentSongId, time: Math.max(0, persistedState.resumePosition.time) }
    : null;

  return {
    ...persistedState,
    queue,
    playbackQueue,
    playlists,
    currentSong,
    currentIndex: currentSongId
      ? Math.max(0, playbackQueue.findIndex((song) => song.id === currentSongId))
      : 0,
    resumePosition: resume,
    volume: typeof persistedState.volume === 'number'
      ? (persistedState.volume > 1
        ? Math.max(0, Math.min(1, persistedState.volume / 100))
        : Math.max(0, Math.min(1, persistedState.volume)))
      : 0.8,
    isMuted: Boolean(persistedState.isMuted),
    enableDiscordRpc: typeof persistedState.enableDiscordRpc === 'boolean'
      ? persistedState.enableDiscordRpc
      : true,
    discordClientId: optionalString(persistedState.discordClientId) || '1534752337543954512',
  };
};
