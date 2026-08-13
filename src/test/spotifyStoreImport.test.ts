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
      isUrlInputOpen: false,
      isDrawerOpen: false,
      drawerTab: 'cd',
      selectedPlaylistId: null,
      youtubeImportTask: null,
      spotifyImportTask: null,
      libraryNotice: null,
    });
  });

  it('imports a Spotify track as one song without creating a playlist', async () => {
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'fetch_spotify_playlist') return {
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
      };
      if (command === 'match_spotify_track') return {
        status: 'matched',
        spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
        videoId: 'aaaaaaaaaaa',
        title: 'Fixture Artist - Fixture Track',
        artist: 'Fixture Artist',
        durationSeconds: 180,
        canonicalUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        score: 96,
      };
      throw new Error(`Unexpected command: ${command}`);
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
    expect(state.queue[0].source).toMatchObject({
      kind: 'spotify',
      matchedVideoId: 'aaaaaaaaaaa',
    });
    expect(state.queue[0].coverUrl).toBe('https://i.scdn.co/image/fixture');
  });

  it('progressively keeps matched playlist tracks and reports skipped tracks', async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === 'fetch_spotify_playlist') return {
        resource_type: 'playlist',
        id: '37i9dQZF1DXcBWIGoYBM5M',
        title: 'Fixture Playlist',
        owner: 'Fixture Owner',
        cover_url: 'https://i.scdn.co/image/playlist-cover',
        tracks: [
          { id: '4xF4ZBGPZKxECeDFrqSAG4', title: 'Good Track', artist: 'Good Artist', duration_seconds: 180, search_query: 'Good Artist Good Track' },
          { id: '0VjIdWI8SuT4Ytz7vLmrCH', title: 'Missing Track', artist: 'Missing Artist', duration_seconds: 200, search_query: 'Missing Artist Missing Track' },
        ],
      };
      if (command === 'match_spotify_track') {
        const request = (args as { request: { spotifyId: string } }).request;
        return request.spotifyId === '4xF4ZBGPZKxECeDFrqSAG4'
          ? {
              status: 'matched',
              spotifyId: request.spotifyId,
              videoId: 'aaaaaaaaaaa',
              title: 'Good Artist - Good Track',
              artist: 'Good Artist',
              durationSeconds: 180,
              canonicalUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
              score: 95,
            }
          : { status: 'skipped', spotifyId: request.spotifyId, reason: 'no_candidates' };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    await usePlayerStore.getState().importSpotifyUrl(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );

    const state = usePlayerStore.getState();
    expect(state.queue.map((song) => song.title)).toEqual(['Good Track']);
    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].songs.map((song) => song.title)).toEqual(['Good Track']);
    expect(state.queue[0].coverUrl).toBe('https://i.scdn.co/image/playlist-cover');
    expect(state.playlists[0].coverUrl).toBe('https://i.scdn.co/image/playlist-cover');
    expect(state.isDrawerOpen).toBe(false);
    expect(state.spotifyImportTask?.status).toBe('partial');
    expect(state.spotifyImportTask?.report).toMatchObject({ added: 1, skipped: 1, processed: 2 });
  });

  it('uses playlist artwork as the initial cover even when a YouTube thumbnail is available', async () => {
    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'fetch_spotify_playlist') return {
        resource_type: 'playlist',
        id: '37i9dQZF1DXcBWIGoYBM5M',
        title: 'Fallback Playlist',
        owner: 'Fixture Owner',
        cover_url: 'https://i.scdn.co/image/playlist-cover',
        tracks: [{
          id: '4xF4ZBGPZKxECeDFrqSAG4',
          title: 'Fallback Track',
          artist: 'Fallback Artist',
          duration_seconds: 180,
          search_query: 'Fallback Artist Fallback Track',
        }],
      };
      if (command === 'match_spotify_track') return {
        status: 'matched',
        spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
        videoId: 'aaaaaaaaaaa',
        title: 'Fallback Track',
        artist: 'Fallback Artist',
        durationSeconds: 180,
        thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/maxresdefault.jpg',
        canonicalUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
        score: 96,
      };
      throw new Error(`Unexpected command: ${command}`);
    });

    await usePlayerStore.getState().importSpotifyUrl(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );

    const state = usePlayerStore.getState();
    expect(state.queue[0].coverUrl).toBe('https://i.scdn.co/image/playlist-cover');
    expect(state.playlists[0].coverUrl).toBe('https://i.scdn.co/image/playlist-cover');
  });

  it('does not close an import panel reopened by the user after first-track autoplay', async () => {
    let releaseSecondMatch!: () => void;
    const secondMatchReady = new Promise<void>((resolve) => {
      releaseSecondMatch = resolve;
    });
    let matchCount = 0;

    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'fetch_spotify_playlist') return {
        resource_type: 'playlist',
        id: '37i9dQZF1DXcBWIGoYBM5M',
        title: 'Two Track Playlist',
        owner: 'Fixture Owner',
        cover_url: 'https://i.scdn.co/image/playlist-cover',
        tracks: [
          { id: '4xF4ZBGPZKxECeDFrqSAG4', title: 'First Track', artist: 'First Artist', duration_seconds: 180, search_query: 'First Artist First Track' },
          { id: '0VjIdWI8SuT4Ytz7vLmrCH', title: 'Second Track', artist: 'Second Artist', duration_seconds: 200, search_query: 'Second Artist Second Track' },
        ],
      };
      if (command === 'match_spotify_track') {
        matchCount += 1;
        if (matchCount === 2) await secondMatchReady;
        return {
          status: 'matched',
          spotifyId: matchCount === 1 ? '4xF4ZBGPZKxECeDFrqSAG4' : '0VjIdWI8SuT4Ytz7vLmrCH',
          videoId: matchCount === 1 ? 'aaaaaaaaaaa' : 'bbbbbbbbbbb',
          title: matchCount === 1 ? 'First Track' : 'Second Track',
          artist: matchCount === 1 ? 'First Artist' : 'Second Artist',
          durationSeconds: matchCount === 1 ? 180 : 200,
          canonicalUrl: `https://www.youtube.com/watch?v=${matchCount === 1 ? 'aaaaaaaaaaa' : 'bbbbbbbbbbb'}`,
          score: 95,
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const importPromise = usePlayerStore.getState().importSpotifyUrl(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );
    await vi.waitFor(() => {
      expect(usePlayerStore.getState().queue).toHaveLength(1);
      expect(usePlayerStore.getState().isUrlInputOpen).toBe(false);
    });

    usePlayerStore.getState().setUrlInputOpen(true);
    releaseSecondMatch();
    await importPromise;

    expect(usePlayerStore.getState().queue).toHaveLength(2);
    expect(usePlayerStore.getState().isUrlInputOpen).toBe(true);
  });

  it('ignores a cancelled match result and does not duplicate the song after retry', async () => {
    type MatchResult = {
      status: 'matched';
      spotifyId: string;
      videoId: string;
      title: string;
      artist: string;
      durationSeconds: number;
      canonicalUrl: string;
      score: number;
    };
    const pendingMatches: Array<{
      resolve: (result: MatchResult) => void;
      promise: Promise<MatchResult>;
    }> = [];

    mockedInvoke.mockImplementation(async (command) => {
      if (command === 'fetch_spotify_playlist') return {
        resource_type: 'playlist',
        id: '37i9dQZF1DXcBWIGoYBM5M',
        title: 'Retry Playlist',
        owner: 'Fixture Owner',
        cover_url: 'https://i.scdn.co/image/playlist-cover',
        tracks: [{
          id: '4xF4ZBGPZKxECeDFrqSAG4',
          title: 'Retry Track',
          artist: 'Retry Artist',
          duration_seconds: 180,
          search_query: 'Retry Artist Retry Track',
        }],
      };
      if (command === 'match_spotify_track') {
        let resolve!: (result: MatchResult) => void;
        const promise = new Promise<MatchResult>((done) => { resolve = done; });
        pendingMatches.push({ resolve, promise });
        return promise;
      }
      if (command === 'cancel_spotify_match') return undefined;
      throw new Error(`Unexpected command: ${command}`);
    });

    const firstImport = usePlayerStore.getState().importSpotifyUrl(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    );
    await vi.waitFor(() => expect(pendingMatches).toHaveLength(1));
    await usePlayerStore.getState().cancelSpotifyTask();

    const retryImport = usePlayerStore.getState().retrySpotifyTask();
    await vi.waitFor(() => expect(pendingMatches).toHaveLength(2));

    const result: MatchResult = {
      status: 'matched',
      spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
      videoId: 'aaaaaaaaaaa',
      title: 'Retry Track',
      artist: 'Retry Artist',
      durationSeconds: 180,
      canonicalUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      score: 97,
    };
    pendingMatches[0].resolve(result);
    await firstImport;
    expect(usePlayerStore.getState().queue).toEqual([]);

    pendingMatches[1].resolve(result);
    await retryImport;

    const state = usePlayerStore.getState();
    expect(state.queue.map((song) => song.id)).toEqual(['spotify-4xF4ZBGPZKxECeDFrqSAG4']);
    expect(state.playlists).toHaveLength(1);
    expect(state.playlists[0].songs.map((song) => song.id)).toEqual([
      'spotify-4xF4ZBGPZKxECeDFrqSAG4',
    ]);
    expect(state.spotifyImportTask?.report).toMatchObject({ added: 1, duplicates: 0 });
  });
});
