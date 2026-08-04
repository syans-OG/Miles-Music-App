import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AudioService, audioService, type AudioElementLike } from '../services/audioService';
import { YoutubeServiceError } from '../services/youtubeService';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { ResolvedYoutubeTrack } from '../types/youtube';
import type { Song } from '../types/player';

audioService.destroy();

class FakeAudio implements AudioElementLike {
  currentTime = 0;
  duration = 180;
  error: { code: number } | null = null;
  preload = '';
  src = '';
  volume = 1;
  playCalls = 0;
  pauseCalls = 0;
  private listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  load() {}

  pause() {
    this.pauseCalls += 1;
  }

  async play() {
    this.playCalls += 1;
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }

  emit(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(new Event(type));
    }
  }
}

const localSong = (id: string): Song => ({
  id,
  title: `Local ${id}`,
  artist: 'Miles',
  coverUrl: 'asset://cover.png',
  source: {
    kind: 'local',
    audioUrl: `asset://audio-${id}.mp3`,
    filePath: `C:\\Miles\\${id}.mp3`,
    managed: true,
  },
  duration: 180,
  playCount: 0,
});

const youtubeSong = (id: string, videoId: string): Song => ({
  id,
  title: `YouTube ${id}`,
  artist: 'Miles',
  coverUrl: 'https://i.ytimg.com/fixture.jpg',
  source: {
    kind: 'youtube',
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    availability: 'available',
  },
  duration: 180,
  playCount: 0,
});

const resolvedTrack = (videoId: string, suffix = ''): ResolvedYoutubeTrack => ({
  videoId,
  title: `Track ${videoId}`,
  artist: 'Miles',
  durationSeconds: 180,
  thumbnailUrl: null,
  canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  liveStatus: 'not_live',
  stream: {
    url: `https://rr1---sn-fixture.googlevideo.com/audio-${videoId}${suffix}`,
    formatId: '140',
    extension: 'm4a',
    audioCodec: 'mp4a.40.2',
    averageBitrateKbps: 128,
    expiresAtUnix: null,
  },
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('AudioService lazy YouTube playback', () => {
  let service: AudioService | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    usePlayerStore.setState({
      currentSong: null,
      queue: [],
      playbackQueue: [],
      currentIndex: 0,
      currentTime: 0,
      playbackIntent: false,
      isPlaying: false,
      playbackStatus: 'idle',
      playbackError: null,
      playbackRetryToken: 0,
      selectionSerial: 0,
      selectionReason: 'restore',
      resumePosition: null,
    });
  });

  afterEach(() => {
    service?.destroy();
    service = null;
  });

  it('starts vinyl state only after the media playing event', async () => {
    const audio = new FakeAudio();
    const song = localSong('one');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio });

    usePlayerStore.getState().playSong(song);
    await flush();

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().playbackStatus).toBe('loading');
    audio.emit('playing');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('does not autoplay when the user pauses during resolution', async () => {
    const audio = new FakeAudio();
    const pending = deferred<ResolvedYoutubeTrack>();
    const resolveTrack = vi.fn(() => pending.promise);
    const song = youtubeSong('a', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(song);
    usePlayerStore.getState().setPlaybackIntent(false);
    pending.resolve(resolvedTrack('aaaaaaaaaaa'));
    await flush();

    expect(audio.src).toBe('');
    expect(audio.playCalls).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('drops a late resolver result after selecting another track', async () => {
    const audio = new FakeAudio();
    const first = deferred<ResolvedYoutubeTrack>();
    const second = deferred<ResolvedYoutubeTrack>();
    const resolveTrack = vi.fn((videoId: string) => videoId === 'aaaaaaaaaaa' ? first.promise : second.promise);
    const songA = youtubeSong('a', 'aaaaaaaaaaa');
    const songB = youtubeSong('b', 'bbbbbbbbbbb');
    usePlayerStore.setState({ queue: [songA, songB], playbackQueue: [songA, songB] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(songA);
    usePlayerStore.getState().playSong(songB);
    second.resolve(resolvedTrack('bbbbbbbbbbb'));
    await flush();
    first.resolve(resolvedTrack('aaaaaaaaaaa'));
    await flush();

    expect(audio.src).toContain('bbbbbbbbbbb');
    expect(audio.src).not.toContain('aaaaaaaaaaa');
  });

  it('stops playing state immediately when a new selection starts resolving', async () => {
    const audio = new FakeAudio();
    const next = deferred<ResolvedYoutubeTrack>();
    const resolveTrack = vi.fn(() => next.promise);
    const songA = localSong('a');
    const songB = youtubeSong('b', 'bbbbbbbbbbb');
    usePlayerStore.setState({ queue: [songA, songB], playbackQueue: [songA, songB] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(songA);
    await flush();
    audio.emit('playing');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    usePlayerStore.getState().playSong(songB);

    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().playbackStatus).toBe('resolving');
    expect(resolveTrack).toHaveBeenCalledTimes(1);
  });

  it('starts local playback immediately while a YouTube resolve becomes stale', async () => {
    const audio = new FakeAudio();
    const pending = deferred<ResolvedYoutubeTrack>();
    const resolveTrack = vi.fn(() => pending.promise);
    const youtube = youtubeSong('a', 'aaaaaaaaaaa');
    const local = localSong('local');
    usePlayerStore.setState({ queue: [youtube, local], playbackQueue: [youtube, local] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(youtube);
    usePlayerStore.getState().playSong(local);
    await flush();

    expect(audio.src).toBe(local.source.kind === 'local' ? local.source.audioUrl : '');
    expect(audio.playCalls).toBe(1);
    pending.resolve(resolvedTrack('aaaaaaaaaaa'));
    await flush();
    expect(audio.src).toBe(local.source.kind === 'local' ? local.source.audioUrl : '');
  });

  it('re-resolves a failed media source exactly once per load cycle', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi
      .fn()
      .mockResolvedValueOnce(resolvedTrack('aaaaaaaaaaa', '-first'))
      .mockResolvedValueOnce(resolvedTrack('aaaaaaaaaaa', '-retry'));
    const clearStreamCache = vi.fn();
    const song = youtubeSong('a', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null, clearStreamCache });

    usePlayerStore.getState().playSong(song);
    await flush();
    audio.error = { code: 2 };
    audio.emit('error');
    await flush();
    audio.emit('error');
    await flush();

    expect(resolveTrack.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['aaaaaaaaaaa', 'explicit_selection'],
      ['aaaaaaaaaaa', 'explicit_selection'],
    ]);
    expect(clearStreamCache).toHaveBeenCalledTimes(1);
    expect(usePlayerStore.getState().playbackError?.retryable).toBe(true);
  });

  it('prefetches the next YouTube track once at the 25 second threshold', async () => {
    const audio = new FakeAudio();
    const current = localSong('one');
    const next = youtubeSong('next', 'bbbbbbbbbbb');
    const resolveTrack = vi.fn().mockResolvedValue(resolvedTrack('bbbbbbbbbbb'));
    usePlayerStore.setState({ queue: [current, next], playbackQueue: [current, next] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(current);
    await flush();
    audio.emit('playing');
    audio.duration = 180;
    audio.currentTime = 156;
    audio.emit('timeupdate');
    audio.emit('timeupdate');
    await flush();

    expect(resolveTrack).toHaveBeenCalledTimes(1);
    expect(resolveTrack.mock.calls[0][1]).toBe('prefetch');
    expect(usePlayerStore.getState().playbackStatus).toBe('playing');
  });

  it('manual retry starts a fresh bounded resolution cycle', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi
      .fn()
      .mockRejectedValueOnce(new YoutubeServiceError({ code: 'process_failed', retryable: false }))
      .mockResolvedValueOnce(resolvedTrack('aaaaaaaaaaa'));
    const song = youtubeSong('a', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(song);
    await flush();
    expect(usePlayerStore.getState().playbackStatus).toBe('error');
    usePlayerStore.getState().requestPlaybackRetry();
    await flush();

    expect(resolveTrack).toHaveBeenCalledTimes(2);
    expect(audio.src).toContain('aaaaaaaaaaa');
    expect(usePlayerStore.getState().playbackError).toBeNull();
  });

  it('purges terminally unavailable tracks from library, playlists, and persistence', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi.fn().mockRejectedValue(
      new YoutubeServiceError({ code: 'unavailable', retryable: false }),
    );
    const songA = youtubeSong('a', 'aaaaaaaaaaa');
    const songB = youtubeSong('b', 'bbbbbbbbbbb');
    usePlayerStore.setState({
      queue: [songA, songB],
      playbackQueue: [songA, songB],
      playlists: [{
        id: 'youtube-playlist',
        name: 'YouTube Playlist',
        curator: 'YouTube',
        coverUrl: songA.coverUrl,
        songs: [songA, songB],
        source: {
          kind: 'youtube',
          playlistId: 'PLDuK_0-3anUREPpS5-EDohLzh29Zpwlv1',
          canonicalUrl: 'https://www.youtube.com/playlist?list=PLDuK_0-3anUREPpS5-EDohLzh29Zpwlv1',
        },
      }],
    });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(songA);
    await flush();
    await flush();

    expect(resolveTrack.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['aaaaaaaaaaa', 'explicit_selection'],
      ['bbbbbbbbbbb', 'explicit_selection'],
    ]);
    expect(usePlayerStore.getState().queue).toHaveLength(0);
    expect(usePlayerStore.getState().playbackQueue).toHaveLength(0);
    expect(usePlayerStore.getState().playlists[0].songs).toHaveLength(0);
    expect(usePlayerStore.getState().currentSong).toBeNull();
    expect(usePlayerStore.getState().playbackIntent).toBe(false);
    expect(usePlayerStore.getState().playbackError?.message).toBe('Tidak ada lagu yang dapat diputar.');
    expect(usePlayerStore.getState().playbackError?.retryable).toBe(false);
    expect(window.localStorage.getItem('aura_music_player_storage')).not.toContain('aaaaaaaaaaa');
    expect(window.localStorage.getItem('aura_music_player_storage')).not.toContain('bbbbbbbbbbb');
  });

  it('resumes playback seamlessly across multiple repeated pause and play cycles', async () => {
    const audio = new FakeAudio();
    const song = localSong('resume-test');
    usePlayerStore.setState({ queue: [song], currentSong: song, playbackQueue: [song] });
    service = new AudioService({ audio });

    // Cycle 1: Start playing
    usePlayerStore.getState().playSong(song);
    await flush();
    audio.emit('playing');
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Cycle 1: Pause
    usePlayerStore.getState().togglePlayPause();
    await flush();
    audio.emit('pause');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().playbackIntent).toBe(false);

    // Cycle 2: Resume Play
    usePlayerStore.getState().togglePlayPause();
    await flush();
    expect(usePlayerStore.getState().playbackIntent).toBe(true);
    audio.emit('playing');
    expect(usePlayerStore.getState().isPlaying).toBe(true);

    // Cycle 2: Pause
    usePlayerStore.getState().togglePlayPause();
    await flush();
    audio.emit('pause');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().playbackIntent).toBe(false);

    // Cycle 3: Resume Play again
    usePlayerStore.getState().togglePlayPause();
    await flush();
    expect(usePlayerStore.getState().playbackIntent).toBe(true);
    expect(audio.playCalls).toBeGreaterThanOrEqual(3);
  });
});
