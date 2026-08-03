import { describe, expect, it } from 'vitest';

import fixture from './fixtures/persistence-v1.json';
import { SUNFLOWER_DEFAULT_SONG } from '../data/defaultLibrary';
import { migratePlayerPersistedState } from '../stores/playerPersistence';
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

describe('Zustand persistence V3 migration', () => {
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
});
