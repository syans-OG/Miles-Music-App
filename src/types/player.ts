export type AppMode = 'control-bar' | 'vinyl-widget' | 'micro-bubble';
export type DockPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'free';
export type PlaybackStatus = 'idle' | 'resolving' | 'loading' | 'playing' | 'buffering' | 'error';
export type PlaybackSelectionReason = 'manual' | 'sequential' | 'auto_skip' | 'restore';

export interface PlaybackErrorState {
  songId: string;
  message: string;
  retryable: boolean;
}

export interface LocalSongSource {
  kind: 'local';
  audioUrl: string;
  filePath: string;
  fileHash?: string;
  coverPath?: string;
  managed: boolean;
}

export type YoutubeAvailability =
  | 'available'
  | 'unavailable'
  | 'live_unsupported'
  | 'upcoming_unsupported';

export interface YoutubeSongSource {
  kind: 'youtube';
  videoId: string;
  canonicalUrl: string;
  availability: YoutubeAvailability;
}

export interface SpotifySongSource {
  kind: 'spotify';
  spotifyId: string;
  searchQuery: string;
  matchedVideoId: string;
  canonicalUrl: string;
}

export type SongSource = LocalSongSource | YoutubeSongSource | SpotifySongSource;

export interface LocalPlaylistSource {
  kind: 'local';
}

export interface YoutubePlaylistSource {
  kind: 'youtube';
  playlistId: string;
  canonicalUrl: string;
}

export interface SpotifyPlaylistSource {
  kind: 'spotify';
  spotifyId: string;
}

export type PlaylistSource = LocalPlaylistSource | YoutubePlaylistSource | SpotifyPlaylistSource;

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl: string;
  source: SongSource;
  duration: number; // in seconds
  isFavorite?: boolean;
  playCount: number;
  listenedSeconds?: number;
  lastPlayed?: number; // timestamp
}

export const isLocalSong = (song: Song): song is Song & { source: LocalSongSource } =>
  song.source.kind === 'local';

export const isYoutubeSong = (song: Song): song is Song & { source: YoutubeSongSource } =>
  song.source.kind === 'youtube';

export interface Playlist {
  id: string;
  name: string;
  curator: string;
  coverUrl: string;
  songs: Song[];
  isPinned?: boolean;
  source?: PlaylistSource;
}

export type YoutubeLinkKind = 'video' | 'playlist';
export type YoutubeImportStatus = 'resolving' | 'importing' | 'success' | 'error' | 'cancelled';

export interface YoutubeImportSkippedItem {
  title: string;
  reason: string;
}

export interface YoutubeImportReport {
  playlistName: string;
  added: number;
  duplicates: number;
  skipped: number;
  truncated: boolean;
  skippedItems: YoutubeImportSkippedItem[];
}

export interface YoutubeImportTask {
  requestId: number;
  inputUrl: string;
  kind: YoutubeLinkKind;
  status: YoutubeImportStatus;
  message: string;
  retryable: boolean;
  backgrounded?: boolean;
  targetPlaylistId?: string;
  report?: YoutubeImportReport;
}
