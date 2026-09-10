import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '../stores/usePlayerStore';
import { usePlaybackMetrics } from '../stores/playbackMetrics';
import type { Song, SongSource } from '../types/player';

const makeSong = (i: number): Song => ({
  id: `bench-${i}`,
  title: `Track ${i}`,
  artist: 'Benchmark',
  coverUrl: '',
  source: { kind: 'local', localPath: `C:\\music\\${i}.mp3` } as SongSource,
  duration: 200,
  playCount: i % 20,
  listenedSeconds: i,
});

const median = (values: number[]) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

describe('playback hot-path persist cost', () => {
  beforeEach(() => {
    window.localStorage.clear();
    usePlayerStore.setState({
      currentSong: null,
      queue: [],
      playbackQueue: [],
      currentIndex: 0,
      currentTime: 0,
      isPlaying: false,
      playbackIntent: false,
      playbackStatus: 'idle',
      playbackError: null,
    });
    usePlaybackMetrics.setState({ currentTime: 0, duration: 0 });
  });

  it('reports elapsed time and persisted writes: new hot path is much cheaper', () => {
    const songs = Array.from({ length: 1000 }, (_, i) => makeSong(i));
    usePlayerStore.setState({ queue: songs, playbackQueue: songs, currentSong: songs[0] });

    const TICKS = 240;
    const songId = songs[0].id;

    const measure = (run: () => void) => {
      const t0 = performance.now();
      run();
      return performance.now() - t0;
    };

    for (let i = 0; i < 20; i++) {
      usePlayerStore.setState({ currentTime: i });
      usePlaybackMetrics.setState({ currentTime: i });
    }

    const runBefore = () => {
      for (let i = 1; i <= TICKS; i++) {
        usePlayerStore.getState().setCurrentTime(i);
        usePlayerStore.getState().addListenedTime(songId, 1);
      }
    };

    const runAfter = () => {
      let pending = 0;
      for (let i = 1; i <= TICKS; i++) {
        usePlaybackMetrics.getState().setCurrentTime(i);
        pending += 1;
        if (i % 40 === 0) {
          usePlayerStore.getState().addListenedTime(songId, pending);
          pending = 0;
        }
        if (i % 20 === 0) {
          usePlayerStore.getState().setCurrentTime(i);
        }
      }
    };

    const iterate = (run: () => void) => {
      usePlayerStore.setState({ currentTime: 0 });
      const spied = vi.spyOn(window.Storage.prototype, 'setItem');
      const t = measure(run);
      const writes = spied.mock.calls.length;
      spied.mockRestore();
      return { t, writes };
    };

    const beforeSamples = Array.from({ length: 5 }, () => iterate(runBefore));
    const afterSamples = Array.from({ length: 5 }, () => iterate(runAfter));

    const beforeMs = median(beforeSamples.map((s) => s.t));
    const afterMs = median(afterSamples.map((s) => s.t));
    const beforeWrites = median(beforeSamples.map((s) => s.writes));
    const afterWrites = median(afterSamples.map((s) => s.writes));

    console.info(
      `[benchmark] persisted-set time before=${beforeMs.toFixed(1)}ms after=${afterMs.toFixed(1)}ms ` +
        `(${TICKS} ticks, ~60s playback, library=1000 songs) | ` +
        `storage writes before=${beforeWrites} after=${afterWrites}`,
    );

    expect(afterMs).toBeLessThan(beforeMs);
    expect(afterWrites).toBeLessThan(beforeWrites);
  });
});