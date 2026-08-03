import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearYoutubeStreamCache,
  getCachedYoutubeStream,
  resolveYoutubeTrack,
} from '../services/youtubeService';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Song } from '../types/player';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const videoId = 'dQw4w9WgXcQ';
const streamUrl = 'https://rr1---sn-fixture.googlevideo.com/videoplayback?expire=9999999999';

describe('volatile YouTube stream persistence boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearYoutubeStreamCache();
    mockedInvoke.mockReset();
  });

  it('keeps a resolved stream in memory and out of Zustand storage', async () => {
    mockedInvoke.mockResolvedValue({
      videoId,
      title: 'Fixture YouTube Track',
      artist: 'Fixture Artist',
      durationSeconds: 180,
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      liveStatus: 'not_live',
      stream: {
        url: streamUrl,
        formatId: '140',
        extension: 'm4a',
        audioCodec: 'mp4a.40.2',
        averageBitrateKbps: 129,
        expiresAtUnix: 9_999_999_999,
      },
    });

    const resolved = await resolveYoutubeTrack(videoId);
    const song: Song = {
      id: `yt-${videoId}`,
      title: resolved.title,
      artist: resolved.artist,
      coverUrl: resolved.thumbnailUrl ?? '',
      source: {
        kind: 'youtube',
        videoId,
        canonicalUrl: resolved.canonicalUrl,
        availability: 'available',
      },
      duration: resolved.durationSeconds,
      playCount: 1,
    };

    usePlayerStore.setState({
      queue: [song],
      playbackQueue: [song],
      playlists: [],
      currentSong: song,
      currentIndex: 0,
    });

    expect(getCachedYoutubeStream(videoId)?.url).toBe(streamUrl);
    expect(mockedInvoke).toHaveBeenCalledWith('resolve_youtube_track', {
      videoId,
      purpose: 'explicit_selection',
    });
    const serialized = window.localStorage.getItem('aura_music_player_storage');
    expect(serialized).toContain(`"videoId":"${videoId}"`);
    expect(serialized).not.toContain('googlevideo.com');
    expect(serialized).not.toContain('expiresAtUnix');
    expect(serialized).not.toContain('requestHeaders');
  });

  it('prevents an older request from overwriting a newer cache entry', async () => {
    let resolveOlder!: (value: unknown) => void;
    let resolveNewer!: (value: unknown) => void;
    mockedInvoke
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOlder = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveNewer = resolve; }));
    const response = (url: string) => ({
      videoId,
      title: 'Fixture',
      artist: 'Miles',
      durationSeconds: 180,
      thumbnailUrl: null,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      liveStatus: 'not_live',
      stream: {
        url,
        formatId: '140',
        extension: 'm4a',
        audioCodec: 'mp4a.40.2',
        averageBitrateKbps: 128,
        expiresAtUnix: null,
      },
    });

    const older = resolveYoutubeTrack(videoId, 'prefetch');
    const newer = resolveYoutubeTrack(videoId, 'explicit_selection');
    resolveNewer(response(`${streamUrl}&generation=newer`));
    await newer;
    resolveOlder(response(`${streamUrl}&generation=older`));
    await older;

    expect(getCachedYoutubeStream(videoId)?.url).toContain('generation=newer');
  });

  it('never persists a YouTube item already marked unavailable', () => {
    const unavailableSong: Song = {
      id: `yt-${videoId}`,
      title: 'Unavailable fixture',
      artist: 'Unknown Artist',
      coverUrl: 'https://i.ytimg.com/fixture.jpg',
      source: {
        kind: 'youtube',
        videoId,
        canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        availability: 'unavailable',
      },
      duration: 0,
      playCount: 0,
    };

    usePlayerStore.setState({
      queue: [unavailableSong],
      playbackQueue: [unavailableSong],
      currentSong: unavailableSong,
      playlists: [{
        id: 'playlist-fixture',
        name: 'Fixture',
        curator: 'YouTube',
        coverUrl: unavailableSong.coverUrl,
        songs: [unavailableSong],
      }],
    });

    const serialized = window.localStorage.getItem('aura_music_player_storage');
    expect(serialized).not.toContain(videoId);
    expect(serialized).not.toContain('Unavailable fixture');
  });
});
