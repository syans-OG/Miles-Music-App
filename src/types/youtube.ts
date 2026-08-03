export type YoutubeLiveStatus = 'not_live' | 'is_live' | 'is_upcoming' | 'was_live' | 'unknown';

export type YoutubeErrorCode =
  | 'invalid_url'
  | 'https_required'
  | 'unsupported_host'
  | 'unsupported_url'
  | 'invalid_video_id'
  | 'invalid_playlist_id'
  | 'live_unsupported'
  | 'upcoming_unsupported'
  | 'private_video'
  | 'age_restricted'
  | 'unavailable'
  | 'invalid_metadata'
  | 'audio_stream_unavailable'
  | 'dependency_unavailable'
  | 'busy'
  | 'cancelled'
  | 'timeout'
  | 'process_failed'
  | 'output_too_large';

export interface YoutubeCommandError {
  code: YoutubeErrorCode;
  retryable: boolean;
  detail?: string;
}

export interface YoutubePlaylistEntry {
  position: number;
  videoId: string;
  title: string;
  artist: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  canonicalUrl: string;
  liveStatus: YoutubeLiveStatus;
}

export interface YoutubeSkippedEntry {
  position: number;
  videoId: string | null;
  title: string | null;
  reason: YoutubeErrorCode;
}

export interface YoutubePlaylistImport {
  playlistId: string;
  title: string;
  canonicalUrl: string;
  entries: YoutubePlaylistEntry[];
  skipped: YoutubeSkippedEntry[];
  totalCandidates: number;
  truncated: boolean;
}

export interface YoutubeAudioStream {
  url: string;
  formatId: string | null;
  extension: string;
  audioCodec: string;
  averageBitrateKbps: number | null;
  expiresAtUnix: number | null;
}

export interface ResolvedYoutubeTrack {
  videoId: string;
  title: string;
  artist: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  canonicalUrl: string;
  liveStatus: YoutubeLiveStatus;
  stream: YoutubeAudioStream;
}
