import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { Song } from '../types/player';

const makeTestSong = (id: string, title: string): Song => ({
  id,
  title,
  artist: 'Artist',
  coverUrl: 'https://example.com/cover.jpg',
  source: { kind: 'local', managed: true, filePath: `/music/${id}.mp3`, audioUrl: `asset:///music/${id}.mp3` },
  duration: 180,
  playCount: 0,
  lastPlayed: Date.now(),
});

describe('Queue Controls and Full Queue Loading', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [],
      playbackQueue: [],
      currentSong: null,
      currentIndex: 0,
      queueEndBehavior: 'stop',
      playbackIntent: false,
    });
  });

  it('loads entire list into playbackQueue and sets currentIndex to clicked song', () => {
    const songs = [makeTestSong('1', 'Song 1'), makeTestSong('2', 'Song 2'), makeTestSong('3', 'Song 3')];
    usePlayerStore.getState().playSongList(songs, 1);

    const state = usePlayerStore.getState();
    expect(state.playbackQueue).toHaveLength(3);
    expect(state.currentSong?.id).toBe('2');
    expect(state.currentIndex).toBe(1);
    expect(state.playbackIntent).toBe(true);
  });

  it('shuffles upcoming queue while preserving current playing song', () => {
    const songs = [
      makeTestSong('1', 'Song 1'),
      makeTestSong('2', 'Song 2'),
      makeTestSong('3', 'Song 3'),
      makeTestSong('4', 'Song 4'),
      makeTestSong('5', 'Song 5'),
    ];
    usePlayerStore.getState().playSongList(songs, 0);

    usePlayerStore.getState().shufflePlaybackQueue();

    const state = usePlayerStore.getState();
    expect(state.playbackQueue).toHaveLength(5);
    expect(state.currentSong?.id).toBe('1');
    expect(state.playbackQueue[0].id).toBe('1');
    expect(state.currentIndex).toBe(0);
  });

  it('toggles queue repeat between repeat-queue and stop', () => {
    expect(usePlayerStore.getState().queueEndBehavior).toBe('stop');

    usePlayerStore.getState().toggleQueueRepeat();
    expect(usePlayerStore.getState().queueEndBehavior).toBe('repeat-queue');

    usePlayerStore.getState().toggleQueueRepeat();
    expect(usePlayerStore.getState().queueEndBehavior).toBe('stop');
  });
});
