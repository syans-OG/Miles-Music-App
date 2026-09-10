import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { detectYoutubeResource } from '../services/youtubeService';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { YoutubePlaylistImport } from '../types/youtube';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const playlistId = 'PLDuK_0-3anUREPpS5-EDohLzh29Zpwlv1';
const playlistUrl = `https://youtube.com/playlist?list=${playlistId}&si=fixture`;

const entry = (videoId: string, position: number) => ({
  position,
  videoId,
  title: `Track ${position}`,
  artist: 'Fixture Artist',
  durationSeconds: 180,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
  canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  liveStatus: 'not_live' as const,
});

const playlistResult = (
  videoIds: string[],
  skipped: YoutubePlaylistImport['skipped'] = [],
): YoutubePlaylistImport => ({
  playlistId,
  title: 'Fixture Playlist',
  canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
  entries: videoIds.map(entry),
  skipped,
  totalCandidates: videoIds.length + skipped.length,
  truncated: false,
});

const resetLibrary = () => {
  usePlayerStore.setState({
    queue: [],
    playbackQueue: [],
    playlists: [],
    currentSong: null,
    currentIndex: 0,
    selectedPlaylistId: null,
    youtubeImportTask: null,
    isDrawerOpen: false,
    isUrlInputOpen: true,
    drawerTab: 'cd',
    playbackIntent: false,
    playbackStatus: 'idle',
    libraryNotice: null,
  });
};

describe('YouTube import UX state', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    resetLibrary();
  });

  it('detects playlist context before video context', () => {
    expect(detectYoutubeResource(playlistUrl)).toMatchObject({ kind: 'playlist', playlistId });
    expect(detectYoutubeResource('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({
      kind: 'video',
      videoId: 'dQw4w9WgXcQ',
    });
    expect(detectYoutubeResource('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('atomically creates, opens, and starts the first valid playlist track', async () => {
    mockedInvoke.mockResolvedValueOnce(playlistResult(['aaaaaaaaaaa', 'bbbbbbbbbbb'], [{
      position: 3,
      videoId: 'ccccccccccc',
      title: 'Live Track',
      reason: 'live_unsupported',
    }]));

    await usePlayerStore.getState().importYoutubeUrl(playlistUrl);

    const state = usePlayerStore.getState();
    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].source).toEqual({
      kind: 'youtube',
      playlistId,
      canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
    });
    expect(state.queue.map((song) => song.id)).toEqual(['yt-aaaaaaaaaaa', 'yt-bbbbbbbbbbb']);
    expect(state.currentSong?.id).toBe('yt-aaaaaaaaaaa');
    expect(state.playbackIntent).toBe(true);
    expect(state.drawerTab).toBe('playlist');
    expect(state.selectedPlaylistId).toBe(`yt-playlist-${playlistId}`);
    expect(state.youtubeImportTask?.report).toMatchObject({ added: 2, duplicates: 0, skipped: 1 });
    expect(state.youtubeImportTask?.report?.skippedItems[0].reason).toBe('Live Streams are not supported.');
  });

  it('syncs only new video ids and rejects a no-op reimport', async () => {
    mockedInvoke
      .mockResolvedValueOnce(playlistResult(['aaaaaaaaaaa', 'bbbbbbbbbbb']))
      .mockResolvedValueOnce(playlistResult(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']))
      .mockResolvedValueOnce(playlistResult(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']));

    await usePlayerStore.getState().importYoutubeUrl(playlistUrl);
    await usePlayerStore.getState().importYoutubeUrl(playlistUrl);
    expect(usePlayerStore.getState().playlists[0].songs).toHaveLength(3);
    expect(usePlayerStore.getState().youtubeImportTask?.report).toMatchObject({ added: 1, duplicates: 2 });

    await usePlayerStore.getState().importYoutubeUrl(playlistUrl);
    expect(usePlayerStore.getState().playlists[0].songs).toHaveLength(3);
    expect(usePlayerStore.getState().youtubeImportTask?.message).toBe('Playlist is already in your library.');
    expect(usePlayerStore.getState().youtubeImportTask?.report).toMatchObject({ added: 0, duplicates: 3 });
  });

  it('cancels the backend operation and ignores its late result', async () => {
    let resolveImport!: (result: YoutubePlaylistImport) => void;
    mockedInvoke.mockImplementation((command) => {
      if (command === 'import_youtube_playlist') {
        return new Promise((resolve) => { resolveImport = resolve; });
      }
      return Promise.resolve();
    });

    const pendingImport = usePlayerStore.getState().importYoutubeUrl(playlistUrl);
    await usePlayerStore.getState().cancelYoutubeTask();
    resolveImport(playlistResult(['aaaaaaaaaaa']));
    await pendingImport;

    expect(mockedInvoke).toHaveBeenCalledWith('cancel_youtube_import');
    expect(usePlayerStore.getState().youtubeImportTask?.status).toBe('cancelled');
    expect(usePlayerStore.getState().playlists).toHaveLength(0);
  });

  it('preserves background state through playlist completion without opening the drawer', async () => {
    let resolveImport!: (result: YoutubePlaylistImport) => void;
    mockedInvoke.mockImplementation((command) => {
      if (command === 'import_youtube_playlist') {
        return new Promise((resolve) => { resolveImport = resolve; });
      }
      return Promise.resolve();
    });

    const pendingImport = usePlayerStore.getState().importYoutubeUrl(playlistUrl);
    usePlayerStore.getState().dismissYoutubeTask();
    resolveImport({ ...playlistResult(['aaaaaaaaaaa']), truncated: true });
    await pendingImport;

    const state = usePlayerStore.getState();
    expect(state.youtubeImportTask).toMatchObject({
      status: 'success',
      backgrounded: true,
      report: { truncated: true },
    });
    expect(state.isDrawerOpen).toBe(false);
  });
});
