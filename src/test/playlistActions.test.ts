import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Song, Playlist } from '../types/player';

const makeSong = (id: string, title: string): Song => ({
  id,
  title,
  artist: 'Artist',
  coverUrl: 'https://example.com/cover.jpg',
  source: { kind: 'local', managed: true, filePath: `/music/${id}.mp3`, audioUrl: `asset:///music/${id}.mp3` },
  duration: 180,
  playCount: 0,
  lastPlayed: Date.now(),
});

const setup = () => {
  const s1 = makeSong('s1', 'Song 1');
  const s2 = makeSong('s2', 'Song 2');
  const s3 = makeSong('s3', 'Song 3');
  const s4 = makeSong('s4', 'Song 4');

  const testPlaylist: Playlist = {
    id: 'p1',
    name: 'Chill Vibes',
    curator: 'Miles',
    coverUrl: s1.coverUrl,
    songs: [s1, s2],
    source: { kind: 'local' },
  };

  usePlayerStore.setState({
    queue: [s1, s2, s3, s4],
    playbackQueue: [s1, s2, s3, s4],
    playlists: [testPlaylist],
    currentSong: s2,
    currentIndex: 1,
    libraryNotice: '',
  });

  return { s1, s2, s3, s4 };
};

describe('Playlist Batch Add', () => {
  beforeEach(() => {
    setup();
  });

  it('adds selected songs to a playlist, skipping existing ones', () => {
    usePlayerStore.getState().addSongsToPlaylist('p1', ['s1', 's3', 's4']);

    const state = usePlayerStore.getState();
    expect(state.playlists[0].songs.map((song) => song.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(state.libraryNotice).toBe('2 lagu ditambahkan ke playlist “Chill Vibes”');
  });

  it('does not duplicate songs when all already exist', () => {
    usePlayerStore.getState().addSongsToPlaylist('p1', ['s1', 's2']);

    const state = usePlayerStore.getState();
    expect(state.playlists[0].songs.map((song) => song.id)).toEqual(['s1', 's2']);
    expect(state.libraryNotice).toBe('');
  });

  it('ignores unknown song ids', () => {
    usePlayerStore.getState().addSongsToPlaylist('p1', ['missing', 's3']);

    const state = usePlayerStore.getState();
    expect(state.playlists[0].songs.map((song) => song.id)).toEqual(['s1', 's2', 's3']);
  });
});

describe('Playlist Reorder', () => {
  beforeEach(() => {
    setup();
  });

  it('moves a song to a new index', () => {
    usePlayerStore.getState().reorderPlaylistSongs('p1', 0, 1);

    const state = usePlayerStore.getState();
    expect(state.playlists[0].songs.map((song) => song.id)).toEqual(['s2', 's1']);
  });

  it('keeps playlist unchanged for invalid indices', () => {
    usePlayerStore.getState().reorderPlaylistSongs('p1', 0, 5);

    const state = usePlayerStore.getState();
    expect(state.playlists[0].songs.map((song) => song.id)).toEqual(['s1', 's2']);
  });
});

describe('Playback Queue Reorder', () => {
  beforeEach(() => {
    setup();
  });

  it('moves a queue item and keeps currentIndex in sync', () => {
    usePlayerStore.getState().reorderPlaybackQueue(0, 3);

    const state = usePlayerStore.getState();
    expect(state.playbackQueue.map((song) => song.id)).toEqual(['s2', 's3', 's4', 's1']);
    expect(state.currentIndex).toBe(0);
  });

  it('ignores out-of-bounds indices', () => {
    usePlayerStore.getState().reorderPlaybackQueue(1, 9);

    const state = usePlayerStore.getState();
    expect(state.playbackQueue.map((song) => song.id)).toEqual(['s1', 's2', 's3', 's4']);
  });
});