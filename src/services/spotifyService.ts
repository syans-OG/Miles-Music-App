import { invoke } from '@tauri-apps/api/core';
import type {
  SpotifyMatchPriority,
  SpotifyPlaylistImport,
  SpotifyResourceType,
  SpotifyTrackMatchRequest,
  SpotifyTrackMatchResult,
} from '../types/spotify';

const SPOTIFY_RESOURCE_TYPES = new Set(['playlist', 'album', 'track']);
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export interface SpotifyResource {
  resourceType: SpotifyResourceType;
  id: string;
}

const toSpotifyResource = (resourceType: string, id: string): SpotifyResource | null =>
  SPOTIFY_RESOURCE_TYPES.has(resourceType) && SPOTIFY_ID_PATTERN.test(id)
    ? { resourceType: resourceType as SpotifyResourceType, id }
    : null;

export const detectSpotifyResource = (url: string): SpotifyResource | null => {
  const clean = url.trim();
  if (clean.startsWith('spotify:')) {
    const parts = clean.split(':');
    return parts.length === 3 ? toSpotifyResource(parts[1], parts[2]) : null;
  }

  try {
    const parsed = new URL(clean);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const hasTrustedBoundary = parsed.protocol === 'https:'
      && parsed.hostname === 'open.spotify.com'
      && !parsed.username
      && !parsed.password
      && !parsed.port
      && !parsed.hash
      && pathParts.length === 2;
    return hasTrustedBoundary ? toSpotifyResource(pathParts[0], pathParts[1]) : null;
  } catch {
    return null;
  }
};

export const isSpotifyUrl = (url: string): boolean => detectSpotifyResource(url) !== null;

export const importSpotifyResource = async (url: string): Promise<SpotifyPlaylistImport> => {
  try {
    const result = await invoke<SpotifyPlaylistImport>('fetch_spotify_playlist', { url: url.trim() });
    return result;
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
      throw new Error(error.message);
    }
    throw new Error('Failed to import Spotify data. Please make sure the link is valid and public.');
  }
};

export class SpotifyMatchError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'SpotifyMatchError';
  }
}

export const matchSpotifyTrack = async (
  request: SpotifyTrackMatchRequest,
  priority: SpotifyMatchPriority = 'import',
): Promise<SpotifyTrackMatchResult> => {
  try {
    return await invoke<SpotifyTrackMatchResult>('match_spotify_track', { request, priority });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = typeof error.code === 'string' ? error.code : 'process_failed';
      const retryable = 'retryable' in error && error.retryable === true;
      throw new SpotifyMatchError(code, retryable);
    }
    throw new SpotifyMatchError('process_failed', true);
  }
};

export const cancelSpotifyMatch = async (): Promise<void> => {
  await invoke('cancel_spotify_match');
};
