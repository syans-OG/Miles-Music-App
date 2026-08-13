export type SpotifyResourceType = 'track' | 'album' | 'playlist';

export interface SpotifyTrackEntry {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover_url?: string;
  duration_seconds: number;
  search_query: string;
}

export interface SpotifyPlaylistImport {
  resource_type: SpotifyResourceType;
  id: string;
  title: string;
  owner: string;
  cover_url?: string;
  tracks: SpotifyTrackEntry[];
}

export interface SpotifyImportError {
  code: string;
  message: string;
}

export type SpotifyMatchSkipReason =
  | 'no_candidates'
  | 'live_unsupported'
  | 'duration_mismatch'
  | 'weak_match';

export interface SpotifyTrackMatchRequest {
  spotifyId: string;
  title: string;
  artist: string;
  durationSeconds: number;
}

export type SpotifyTrackMatchResult =
  | {
      status: 'matched';
      spotifyId: string;
      videoId: string;
      title: string;
      artist: string;
      durationSeconds: number;
      spotifyCoverUrl?: string;
      thumbnailUrl?: string;
      canonicalUrl: string;
      score: number;
    }
  | {
      status: 'skipped';
      spotifyId: string;
      reason: SpotifyMatchSkipReason;
    };

export type SpotifyImportStatus =
  | 'fetching'
  | 'matching'
  | 'completed'
  | 'partial'
  | 'cancelled'
  | 'error';

export interface SpotifyImportSkippedItem {
  title: string;
  reason: string;
}

export interface SpotifyImportReport {
  playlistName: string;
  added: number;
  duplicates: number;
  skipped: number;
  processed: number;
  total: number;
  truncated: boolean;
  skippedItems: SpotifyImportSkippedItem[];
}

export interface SpotifyImportTask {
  requestId: number;
  inputUrl: string;
  resourceType: SpotifyResourceType;
  status: SpotifyImportStatus;
  message: string;
  retryable: boolean;
  targetPlaylistId?: string;
  report: SpotifyImportReport;
}
