import { describe, expect, it } from 'vitest';

import fixture from './fixtures/persistence-v1.json';
import { SUNFLOWER_DEFAULT_SONG } from '../data/defaultLibrary';
import { migratePlayerPersistedState, normalizeRestoredSong } from '../stores/playerPersistence';
import type { Playlist, Song } from '../types/player';

describe('Zustand persistence V1 fixture', () => {
  it('captures local media fields that migration must preserve', () => {
    const localSong = fixture.state.queue.find((song) => song.id === 'local-fixture-1');

    expect(localSong).toMatchObject({
      isLocal: true,
      isFavorite: true,
      fileHash: 'fixture-local-hash',
      playCount: 7,
    });
  });

  it('captures valid and invalid legacy YouTube placeholders', () => {
    const valid = fixture.state.queue.find((song) => song.id === 'yt-legacy-valid');
    const invalid = fixture.state.queue.find((song) => song.id === 'yt-legacy-invalid');

    expect(valid?.youtubeUrl).toContain('dQw4w9WgXcQ');
    expect(invalid?.youtubeUrl).toBe('https://example.com/not-youtube');
  });

  it('captures playlist membership, favorites, play count, and resume state', () => {
    expect(fixture.version).toBe(0);
    expect(fixture.state.playlists[0].songs.map((song) => song.id)).toEqual([
      'local-fixture-1',
      'yt-legacy-valid',
    ]);
    expect(fixture.state.currentSong.id).toBe('yt-legacy-valid');
    expect(fixture.state.resumePosition).toEqual({
      songId: 'yt-legacy-valid',
      time: 42,
    });
  });
});

describe('Zustand persistence V6 migration', () => {
  const migrateFixture = () => migratePlayerPersistedState(fixture.state, fixture.version) as {
    queue: Song[];
    playbackQueue: Song[];
    playlists: Playlist[];
    currentSong: Song | null;
    currentIndex: number;
    resumePosition: { songId: string; time: number } | null;
  };

  it('preserves managed local media, favorites, and analytics', () => {
    const migrated = migrateFixture();
    const localSong = migrated.queue.find((song) => song.id === 'local-fixture-1');

    expect(localSong).toMatchObject({
      isFavorite: true,
      playCount: 7,
      source: {
        kind: 'local',
        managed: true,
        fileHash: 'fixture-local-hash',
        filePath: expect.stringContaining('fixture-song.mp3'),
      },
    });
  });

  it('keeps valid YouTube metadata without a persistent stream URL', () => {
    const migrated = migrateFixture();
    const youtubeSong = migrated.queue.find((song) => song.id === 'yt-legacy-valid');

    expect(youtubeSong).toMatchObject({
      isFavorite: true,
      playCount: 3,
      source: {
        kind: 'youtube',
        videoId: 'dQw4w9WgXcQ',
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        availability: 'available',
      },
    });
    expect(youtubeSong?.source).not.toHaveProperty('audioUrl');
    expect(youtubeSong).not.toHaveProperty('youtubeUrl');
  });

  it('removes invalid placeholders and repairs every persisted reference', () => {
    const migrated = migrateFixture();

    expect(migrated.queue.map((song) => song.id)).toEqual([
      SUNFLOWER_DEFAULT_SONG.id,
      'local-fixture-1',
      'yt-legacy-valid',
    ]);
    expect(migrated.playbackQueue.map((song) => song.id)).toEqual([
      'local-fixture-1',
      'yt-legacy-valid',
    ]);
    expect(migrated.playlists[0].songs.map((song) => song.id)).toEqual([
      'local-fixture-1',
      'yt-legacy-valid',
    ]);
    expect(migrated.currentSong?.id).toBe('yt-legacy-valid');
    expect(migrated.currentIndex).toBe(1);
    expect(migrated.resumePosition).toEqual({ songId: 'yt-legacy-valid', time: 42 });
  });

  it('replaces legacy bundled songs and playlists with Sunflower once', () => {
    const migrated = migratePlayerPersistedState({
      queue: [{
        id: 'song-2',
        title: 'Snooze',
        artist: 'SZA',
        coverUrl: 'https://example.com/cover.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        filePath: 'https://example.com/audio.mp3',
      }],
      playbackQueue: [],
      playlists: [{
        id: 'pl-2',
        name: 'Legacy demo',
        curator: 'Miles',
        coverUrl: 'https://example.com/cover.jpg',
        songs: [],
      }],
      currentSong: null,
    }, 2) as { queue: Song[]; playlists: Playlist[]; currentSong: Song | null };

    expect(migrated.queue).toEqual([SUNFLOWER_DEFAULT_SONG]);
    expect(migrated.playlists).toEqual([]);
    expect(migrated.currentSong).toEqual(SUNFLOWER_DEFAULT_SONG);
  });

  it('preserves verified Spotify matches and their playlist membership', () => {
    const spotifySong = {
      id: 'spotify-4xF4ZBGPZKxECeDFrqSAG4',
      title: 'Verified track',
      artist: 'Verified artist',
      coverUrl: 'https://example.com/spotify.jpg',
      source: {
        kind: 'spotify',
        spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
        searchQuery: 'Verified artist Verified track',
        matchedVideoId: 'dQw4w9WgXcQ',
        canonicalUrl: 'https://tampered.example/video',
      },
      duration: 180,
      playCount: 4,
    };
    const migrated = migratePlayerPersistedState({
      queue: [spotifySong],
      playbackQueue: [spotifySong],
      playlists: [{
        id: 'spotify-playlist-37i9dQZF1DXcBWIGoYBM5M',
        name: 'Verified playlist',
        curator: 'Spotify',
        coverUrl: 'https://example.com/playlist.jpg',
        songs: [spotifySong],
        source: { kind: 'spotify', spotifyId: '37i9dQZF1DXcBWIGoYBM5M' },
      }],
      currentSong: spotifySong,
    }, 3) as { queue: Song[]; playlists: Playlist[] };

    expect(migrated.queue.find((song) => song.id === spotifySong.id)?.source).toEqual({
      kind: 'spotify',
      spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
      searchQuery: 'Verified artist Verified track',
      matchedVideoId: 'dQw4w9WgXcQ',
      canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    });
    expect(migrated.queue.find((song) => song.id === spotifySong.id)?.coverUrl)
      .toBe('https://example.com/spotify.jpg');
    expect(migrated.playlists[0]).toMatchObject({
      source: { kind: 'spotify', spotifyId: '37i9dQZF1DXcBWIGoYBM5M' },
      songs: [{ id: spotifySong.id }],
    });
  });

  it('removes legacy Spotify items that do not have a valid matched video ID', () => {
    const migrated = migratePlayerPersistedState({
      queue: [{
        id: 'spotify-legacy',
        title: 'Legacy track',
        artist: 'Legacy artist',
        coverUrl: 'https://example.com/legacy.jpg',
        source: {
          kind: 'spotify',
          spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
          searchQuery: 'Legacy artist Legacy track',
        },
        duration: 180,
        playCount: 0,
      }],
      playbackQueue: [],
      playlists: [],
      currentSong: null,
    }, 3) as { queue: Song[] };

    expect(migrated.queue).toEqual([SUNFLOWER_DEFAULT_SONG]);
  });

  it('preserves a Spotify cover when persisted storage is already on the current version', () => {
    const song: Song = {
      id: 'spotify-current-version',
      title: 'Current version track',
      artist: 'Current artist',
      coverUrl: 'https://i.scdn.co/image/playlist-cover',
      source: {
        kind: 'spotify',
        spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
        searchQuery: 'Current artist Current version track',
        matchedVideoId: 'dQw4w9WgXcQ',
        canonicalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      duration: 180,
      playCount: 0,
    };

    expect(normalizeRestoredSong(song).coverUrl)
      .toBe('https://i.scdn.co/image/playlist-cover');
  });
});
