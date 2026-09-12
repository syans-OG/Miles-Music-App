import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlayerStore } from '../stores/usePlayerStore';
import type { Song } from '../types/player';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const ytSong = (videoId: string): Song => ({
  id: `yt-${videoId}`,
  title: `Track ${videoId}`,
  artist: 'Fixture Artist',
  album: 'YouTube',
  coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
  source: {
    kind: 'youtube',
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    availability: 'available',
  },
  duration: 180,
  playCount: 0,
});

const downloadedTrack = (videoId: string) => ({
  videoId,
  filePath: `D:\\library\\fakehash-${videoId}.m4a`,
  fileHash: `hash-${videoId}`,
  coverPath: null,
  durationSeconds: 180,
});

describe('sequential offline downloads keep independent files', () => {
  beforeEach(async () => {
    mockedInvoke.mockReset();
    const songA = ytSong('aaaaaaaaaaa');
    const songB = ytSong('bbbbbbbbbbb');
    usePlayerStore.setState({
      queue: [songA, songB],
      playbackQueue: [songA, songB],
      playlists: [],
      currentSong: songA,
      currentIndex: 0,
      downloadTask: null,
      libraryNotice: null,
    });
  });

  it('keeps song A offline info after downloading song B', async () => {
    mockedInvoke.mockImplementation((command, args) => {
      if (command === 'download_youtube_track') {
        const { videoId } = args as { videoId: string };
        return Promise.resolve(downloadedTrack(videoId));
      }
      return Promise.resolve();
    });

    const store = usePlayerStore;
    const [songA, songB] = store.getState().queue;

    await store.getState().enqueueDownloads([songA.id]);
    await store.getState().enqueueDownloads([songB.id]);

    const offlineA = store.getState().queue.find((s) => s.id === songA.id)?.offline;
    const offlineB = store.getState().queue.find((s) => s.id === songB.id)?.offline;

    expect(offlineA?.fileHash).toBe('hash-aaaaaaaaaaa');
    expect(offlineA?.filePath).toBe('D:\\library\\fakehash-aaaaaaaaaaa.m4a');
    expect(offlineB?.fileHash).toBe('hash-bbbbbbbbbbb');
    expect(offlineB?.filePath).toBe('D:\\library\\fakehash-bbbbbbbbbbb.m4a');
  });

  it('invokes the backend once per song with the correct video id', async () => {
    mockedInvoke.mockImplementation((command, args) => {
      if (command === 'download_youtube_track') {
        const { videoId } = args as { videoId: string };
        return Promise.resolve(downloadedTrack(videoId));
      }
      return Promise.resolve();
    });

    const store = usePlayerStore;
    const [songA, songB] = store.getState().queue;
    await store.getState().enqueueDownloads([songA.id, songB.id]);

    const downloadCalls = mockedInvoke.mock.calls.filter(([command]) => command === 'download_youtube_track');
    expect(downloadCalls).toHaveLength(2);
    expect(downloadCalls.map(([, args]) => (args as { videoId: string }).videoId)).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
    ]);
  });

  it('cancels nothing when the previous task already finished', async () => {
    mockedInvoke.mockImplementation((command, args) => {
      if (command === 'download_youtube_track') {
        const { videoId } = args as { videoId: string };
        return Promise.resolve(downloadedTrack(videoId));
      }
      return Promise.resolve();
    });

    const store = usePlayerStore;
    const [songA, songB] = store.getState().queue;
    await store.getState().enqueueDownloads([songA.id]);
    await store.getState().enqueueDownloads([songB.id]);

    expect(mockedInvoke.mock.calls.some(([command]) => command === 'cancel_youtube_download')).toBe(false);
  });

  it('queues a second download behind the in-flight one and keeps both songs', async () => {
    mockedInvoke.mockImplementation((command, args) => {
      if (command === 'download_youtube_track') {
        const { videoId } = args as { videoId: string };
        return new Promise((resolve) => {
          window.setTimeout(() => resolve(downloadedTrack(videoId)), 1);
        });
      }
      return Promise.resolve();
    });

    const store = usePlayerStore;
    const [songA, songB] = store.getState().queue;

    const firstDownload = store.getState().enqueueDownloads([songA.id]);
    await store.getState().enqueueDownloads([songB.id]);

    expect(store.getState().downloadTask?.queue.map((item) => item.songId)).toEqual([songA.id, songB.id]);
    await firstDownload;

    const videoIds = mockedInvoke.mock.calls
      .filter(([command]) => command === 'download_youtube_track')
      .map(([, args]) => (args as { videoId: string }).videoId);
    expect(videoIds).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    expect(mockedInvoke.mock.calls.some(([command]) => command === 'cancel_youtube_download')).toBe(false);

    const offlineA = store.getState().queue.find((s) => s.id === songA.id)?.offline;
    const offlineB = store.getState().queue.find((s) => s.id === songB.id)?.offline;
    expect(offlineA?.fileHash).toBe('hash-aaaaaaaaaaa');
    expect(offlineA?.filePath).toBe('D:\\library\\fakehash-aaaaaaaaaaa.m4a');
    expect(offlineB?.fileHash).toBe('hash-bbbbbbbbbbb');
    expect(offlineB?.filePath).toBe('D:\\library\\fakehash-bbbbbbbbbbb.m4a');
  });
});