import { invoke } from '@tauri-apps/api/core';

import type {
  ResolvedYoutubeTrack,
  YoutubeAudioStream,
  YoutubeCommandError,
  YoutubeErrorCode,
  YoutubePlaylistImport,
} from '../types/youtube';

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,80}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const STREAM_EXPIRY_SAFETY_SECONDS = 30;
const MAX_STREAM_CACHE_ENTRIES = 4;

export type YoutubeResolvePurpose = 'explicit_selection' | 'sequential_next' | 'prefetch';
export type YoutubeResolutionStatus = 'resolving' | 'ready' | 'error';
export type YoutubeResource =
  | { kind: 'video'; videoId: string; canonicalUrl: string }
  | { kind: 'playlist'; playlistId: string; canonicalUrl: string };

interface YoutubeRuntimeResolution {
  requestToken: number;
  status: YoutubeResolutionStatus;
  stream?: YoutubeAudioStream;
  thumbnailUrl?: string | null;
  error?: YoutubeServiceError;
  lastAccessedAt: number;
}

export interface CachedYoutubeStream extends YoutubeAudioStream {
  thumbnailUrl?: string | null;
}

const runtimeResolutions = new Map<string, YoutubeRuntimeResolution>();
let nextRequestToken = 1;

const errorMessages: Record<YoutubeErrorCode, string> = {
  invalid_url: 'Invalid YouTube URL.',
  https_required: 'YouTube link must use HTTPS.',
  unsupported_host: 'Link host is not supported.',
  unsupported_url: 'YouTube link type is not supported.',
  invalid_video_id: 'Invalid YouTube video ID.',
  invalid_playlist_id: 'Invalid YouTube playlist ID.',
  live_unsupported: 'Live Streams are not supported.',
  upcoming_unsupported: 'Upcoming videos are not supported.',
  private_video: 'Private videos cannot be imported.',
  age_restricted: 'Age-restricted videos cannot be accessed.',
  unavailable: 'Video is unavailable.',
  invalid_metadata: 'Invalid YouTube metadata.',
  audio_stream_unavailable: 'Audio stream is unavailable.',
  dependency_unavailable: 'Miles YouTube component is unavailable.',
  busy: 'YouTube service is busy.',
  cancelled: 'YouTube task cancelled.',
  timeout: 'YouTube request timed out. Please try again.',
  process_failed: 'Failed to process YouTube link.',
  output_too_large: 'Playlist data exceeds safety limit.',
};

export const getYoutubeErrorMessage = (code: YoutubeErrorCode): string => errorMessages[code];

export class YoutubeServiceError extends Error {
  readonly code: YoutubeErrorCode;
  readonly retryable: boolean;
  readonly detail?: string;

  constructor(error: YoutubeCommandError) {
    super(`${errorMessages[error.code]}${error.detail ? ` — ${error.detail}` : ''}`);
    this.name = 'YoutubeServiceError';
    this.code = error.code;
    this.retryable = error.retryable;
    this.detail = error.detail;
  }
}

const isYoutubeErrorCode = (value: unknown): value is YoutubeErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(errorMessages, value);

export const toYoutubeServiceError = (error: unknown): YoutubeServiceError => {
  if (error instanceof YoutubeServiceError) return error;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as Partial<YoutubeCommandError>;
    if (isYoutubeErrorCode(candidate.code)) {
      return new YoutubeServiceError({
        code: candidate.code,
        retryable: candidate.retryable === true,
        detail: typeof candidate.detail === 'string' ? candidate.detail : undefined,
      });
    }
  }
  return new YoutubeServiceError({ code: 'process_failed', retryable: false });
};

const isFresh = (stream: YoutubeAudioStream) =>
  stream.expiresAtUnix === null
  || stream.expiresAtUnix - STREAM_EXPIRY_SAFETY_SECONDS > Math.floor(Date.now() / 1000);

const trimRuntimeCache = () => {
  if (runtimeResolutions.size <= MAX_STREAM_CACHE_ENTRIES) return;
  const removable = [...runtimeResolutions.entries()]
    .filter(([, entry]) => entry.status !== 'resolving')
    .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt);
  while (runtimeResolutions.size > MAX_STREAM_CACHE_ENTRIES && removable.length > 0) {
    const oldest = removable.shift();
    if (oldest) runtimeResolutions.delete(oldest[0]);
  }
};

export const getCachedYoutubeStream = (videoId: string): CachedYoutubeStream | null => {
  const resolution = runtimeResolutions.get(videoId);
  if (resolution?.status !== 'ready' || !resolution.stream) return null;
  if (isFresh(resolution.stream)) {
    resolution.lastAccessedAt = Date.now();
    return { ...resolution.stream, thumbnailUrl: resolution.thumbnailUrl };
  }
  runtimeResolutions.delete(videoId);
  return null;
};

export const getYoutubeResolutionStatus = (videoId: string): YoutubeResolutionStatus | 'unresolved' =>
  runtimeResolutions.get(videoId)?.status ?? 'unresolved';

export const clearYoutubeStreamCache = (videoId?: string) => {
  if (videoId) runtimeResolutions.delete(videoId);
  else runtimeResolutions.clear();
};

const uniqueQueryValue = (url: URL, key: string): string | null => {
  const values = url.searchParams.getAll(key);
  return values.length === 1 && values[0] ? values[0] : null;
};

export const detectYoutubeResource = (input: string): YoutubeResource | null => {
  try {
    const value = input.trim();
    if (!value || value.length > 2_048 || value.startsWith('-')) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'youtu.be' && !YOUTUBE_HOSTS.has(host)) return null;

    const playlistId = uniqueQueryValue(url, 'list');
    if (playlistId) {
      return PLAYLIST_ID_PATTERN.test(playlistId)
        ? {
            kind: 'playlist',
            playlistId,
            canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
          }
        : null;
    }
    if (url.searchParams.getAll('list').length > 1) return null;

    const segments = url.pathname.split('/').filter(Boolean);
    const videoId = host === 'youtu.be'
      ? (segments.length === 1 ? segments[0] : null)
      : url.pathname === '/watch'
        ? uniqueQueryValue(url, 'v')
        : segments.length === 2 && ['shorts', 'embed', 'live', 'v'].includes(segments[0])
          ? segments[1]
          : null;
    return videoId && VIDEO_ID_PATTERN.test(videoId)
      ? {
          kind: 'video',
          videoId,
          canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        }
      : null;
  } catch {
    return null;
  }
};

export const extractYoutubeVideoId = (input: string): string | null => {
  const resource = detectYoutubeResource(input);
  return resource?.kind === 'video' ? resource.videoId : null;
};

export const importYoutubePlaylist = async (url: string): Promise<YoutubePlaylistImport> => {
  try {
    return await invoke<YoutubePlaylistImport>('import_youtube_playlist', { url });
  } catch (error) {
    throw toYoutubeServiceError(error);
  }
};

export const cancelYoutubeImport = async (): Promise<void> => {
  await invoke('cancel_youtube_import');
};

export const cancelYoutubeResolve = async (): Promise<void> => {
  await invoke('cancel_youtube_resolve');
};

export const resolveYoutubeTrack = async (
  videoId: string,
  purpose: YoutubeResolvePurpose = 'explicit_selection',
  shouldCommit: () => boolean = () => true,
): Promise<ResolvedYoutubeTrack> => {
  if (!videoId || (!VIDEO_ID_PATTERN.test(videoId) && !videoId.startsWith('ytsearch1:'))) {
    throw new YoutubeServiceError({ code: 'invalid_video_id', retryable: false });
  }

  const requestToken = nextRequestToken++;
  runtimeResolutions.set(videoId, {
    requestToken,
    status: 'resolving',
    lastAccessedAt: Date.now(),
  });
  try {
    const track = await invoke<ResolvedYoutubeTrack>('resolve_youtube_track', { videoId, purpose });
    if (runtimeResolutions.get(videoId)?.requestToken === requestToken) {
      if (shouldCommit()) {
        runtimeResolutions.set(videoId, {
          requestToken,
          status: 'ready',
          stream: track.stream,
          thumbnailUrl: track.thumbnailUrl,
          lastAccessedAt: Date.now(),
        });
        trimRuntimeCache();
      } else {
        runtimeResolutions.delete(videoId);
      }
    }
    return track;
  } catch (error) {
    const mapped = toYoutubeServiceError(error);
    if (runtimeResolutions.get(videoId)?.requestToken === requestToken) {
      if (shouldCommit()) {
        runtimeResolutions.set(videoId, {
          requestToken,
          status: 'error',
          error: mapped,
          lastAccessedAt: Date.now(),
        });
        trimRuntimeCache();
      } else {
        runtimeResolutions.delete(videoId);
      }
    }
    throw mapped;
  }
};
