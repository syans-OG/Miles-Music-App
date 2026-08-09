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
