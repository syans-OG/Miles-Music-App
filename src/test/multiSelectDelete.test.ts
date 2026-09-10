import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Song, Playlist } from '../types/player';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

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

describe('Multi-Select Batch Song Deletion', () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue(undefined);
    const s1 = makeSong('s1', 'Song 1');
    const s2 = makeSong('s2', 'Song 2');
    const s3 = makeSong('s3', 'Song 3');
    const s4 = makeSong('s4', 'Song 4');

    const testPlaylist: Playlist = {
      id: 'p1',
      name: 'Chill Vibes',
      curator: 'Miles',
      coverUrl: s1.coverUrl,
      songs: [s1, s2, s3],
      source: { kind: 'local' },
    };

    usePlayerStore.setState({
      queue: [s1, s2, s3, s4],
      playbackQueue: [s1, s2, s3, s4],
      playlists: [testPlaylist],
      currentSong: s2,
      currentIndex: 1,
      topSongs: [s1, s2, s3, s4],
      libraryNotice: '',
    });
  });

  it('deletes multiple selected songs from queue, playbackQueue, and playlists', async () => {
    await usePlayerStore.getState().deleteMultipleSongs(['s2', 's3']);

    const state = usePlayerStore.getState();
    expect(state.queue.map((s) => s.id)).toEqual(['s1', 's4']);
    expect(state.playbackQueue.map((s) => s.id)).toEqual(['s1', 's4']);
    expect(state.playlists[0].songs.map((s) => s.id)).toEqual(['s1']);
    expect(state.libraryNotice).toBe('2 track(s) deleted');
  });

  it('gracefully switches currentSong if currentSong was deleted in batch', async () => {
    await usePlayerStore.getState().deleteMultipleSongs(['s2']);

    const state = usePlayerStore.getState();
    expect(state.currentSong?.id).toBe('s3');
    expect(state.playbackIntent).toBe(false);
  });

  it('keeps songs and reports partial failure when file deletion fails', async () => {
    mockedInvoke.mockRejectedValue(new Error('locked by another process'));

    await usePlayerStore.getState().deleteMultipleSongs(['s2', 's3']);

    const state = usePlayerStore.getState();
    expect(state.queue.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(state.playbackQueue.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(state.currentSong?.id).toBe('s2');
    expect(state.libraryNotice).toBe('0 track(s) deleted, 2 failed');
  });

  it('removes only songs whose files were deleted when deletion partially fails', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('locked'));
    await usePlayerStore.getState().deleteMultipleSongs(['s2', 's3']);

    const state = usePlayerStore.getState();
    expect(state.queue.map((s) => s.id)).toEqual(['s1', 's2', 's4']);
    expect(state.playlists[0].songs.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(state.libraryNotice).toBe('1 track(s) deleted, 1 failed');
  });

  it('toggles song in playlist correctly', () => {
    const song4 = makeSong('s4', 'Song 4');
    usePlayerStore.getState().toggleSongInPlaylist('p1', song4.id);

    const state = usePlayerStore.getState();
    expect(state.playlists[0].songs.map((s) => s.id)).toContain('s4');

    // Toggle again removes it
    usePlayerStore.getState().toggleSongInPlaylist('p1', song4.id);
    const state2 = usePlayerStore.getState();
    expect(state2.playlists[0].songs.map((s) => s.id)).not.toContain('s4');
  });
});
