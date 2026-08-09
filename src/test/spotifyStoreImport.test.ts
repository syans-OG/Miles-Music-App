import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '../stores/usePlayerStore';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => path,
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe('Spotify store import behavior', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    usePlayerStore.setState({
      queue: [],
      playlists: [],
      playbackQueue: [],
      currentSong: null,
      currentIndex: 0,
      currentTime: 0,
      playbackIntent: false,
      playbackStatus: 'idle',
      drawerTab: 'cd',
      selectedPlaylistId: null,
      youtubeImportTask: null,
      libraryNotice: null,
    });
  });

  it('imports a Spotify track as one song without creating a playlist', async () => {
    mockedInvoke.mockResolvedValue({
      resource_type: 'track',
      id: '4xF4ZBGPZKxECeDFrqSAG4',
      title: 'Fixture Track',
      owner: 'Fixture Artist',
      cover_url: 'https://i.scdn.co/image/fixture',
      tracks: [{
        id: '4xF4ZBGPZKxECeDFrqSAG4',
        title: 'Fixture Track',
        artist: 'Fixture Artist',
        album: 'Fixture Album',
        cover_url: 'https://i.scdn.co/image/fixture',
        duration_seconds: 180,
        search_query: 'Fixture Artist Fixture Track',
      }],
    });

    await usePlayerStore.getState().importSpotifyUrl(
      'https://open.spotify.com/track/4xF4ZBGPZKxECeDFrqSAG4',
    );

    const state = usePlayerStore.getState();
    expect(state.queue.map((song) => song.id)).toEqual(['spotify-4xF4ZBGPZKxECeDFrqSAG4']);
    expect(state.playlists).toEqual([]);
    expect(state.currentSong?.id).toBe('spotify-4xF4ZBGPZKxECeDFrqSAG4');
    expect(state.playbackIntent).toBe(true);
    expect(state.drawerTab).toBe('cd');
    expect(state.selectedPlaylistId).toBeNull();
  });
});
