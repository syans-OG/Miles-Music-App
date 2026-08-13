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

const spotifySong = (id: string, videoId: string): Song => ({
  id,
  title: `Spotify ${id}`,
  artist: 'Miles',
  coverUrl: 'https://i.scdn.co/image/fixture.jpg',
  source: {
    kind: 'spotify',
    spotifyId: '4xF4ZBGPZKxECeDFrqSAG4',
    searchQuery: 'Miles fixture',
    matchedVideoId: videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
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

  it('resolves a verified Spotify song through the stable search resolver', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi.fn().mockResolvedValue(resolvedTrack('aaaaaaaaaaa'));
    const song = spotifySong('spotify-fixture', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(song);
    await flush();

    expect(resolveTrack).toHaveBeenCalledWith(
      'ytsearch1:Miles fixture',
      'explicit_selection',
      expect.any(Function),
    );
  });

  it('upgrades and persists a Spotify placeholder after playback resolves a YouTube thumbnail', async () => {
    const audio = new FakeAudio();
    const resolved = {
      ...resolvedTrack('bbbbbbbbbbb'),
      thumbnailUrl: 'https://i.ytimg.com/vi/bbbbbbbbbbb/maxresdefault.jpg',
    };
    const resolveTrack = vi.fn().mockResolvedValue(resolved);
    const song = spotifySong('spotify-cover', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(song);
    await flush();

    expect(usePlayerStore.getState().currentSong?.coverUrl).toBe(resolved.thumbnailUrl);
    expect(usePlayerStore.getState().queue[0].coverUrl).toBe(resolved.thumbnailUrl);
  });

  it('upgrades a Spotify placeholder when playback uses a prefetched stream', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi.fn();
    const song = spotifySong('spotify-prefetched-cover', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({
      audio,
      resolveTrack,
      getCachedStream: () => ({
        ...resolvedTrack('bbbbbbbbbbb').stream,
        thumbnailUrl: 'https://i.ytimg.com/vi/bbbbbbbbbbb/maxresdefault.jpg',
      }),
    });

    usePlayerStore.getState().playSong(song);
    await flush();

    expect(resolveTrack).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queue[0].coverUrl).toBe(
      'https://i.ytimg.com/vi/bbbbbbbbbbb/maxresdefault.jpg',
    );
  });

  it('keeps Spotify startup loading when load emits pause before playing', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi.fn().mockResolvedValue(resolvedTrack('aaaaaaaaaaa'));
    const song = spotifySong('spotify-startup', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null });

    usePlayerStore.getState().playSong(song);
    await flush();
    expect(usePlayerStore.getState().playbackStatus).toBe('loading');

    audio.emit('pause');

    expect(usePlayerStore.getState().playbackStatus).toBe('loading');
    expect(usePlayerStore.getState().playbackIntent).toBe(true);
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

  it('re-resolves a failed Spotify media source exactly once per load cycle', async () => {
    const audio = new FakeAudio();
    const resolveTrack = vi
      .fn()
      .mockResolvedValueOnce(resolvedTrack('aaaaaaaaaaa', '-first'))
      .mockResolvedValueOnce(resolvedTrack('aaaaaaaaaaa', '-retry'));
    const clearStreamCache = vi.fn();
    const song = spotifySong('spotify-a', 'aaaaaaaaaaa');
    usePlayerStore.setState({ queue: [song], playbackQueue: [song] });
    service = new AudioService({ audio, resolveTrack, getCachedStream: () => null, clearStreamCache });

    usePlayerStore.getState().playSong(song);
    await flush();
    audio.error = { code: 2 };
    audio.emit('error');
    await flush();

    expect(resolveTrack).toHaveBeenCalledTimes(2);
    expect(clearStreamCache).toHaveBeenCalledWith('ytsearch1:Miles fixture');
    expect(usePlayerStore.getState().playbackError).toBeNull();
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

  it('lets the user cancel a pending playback intent before audio starts', () => {
    const song = spotifySong('spotify-pending', 'aaaaaaaaaaa');
    usePlayerStore.setState({
      currentSong: song,
      queue: [song],
      playbackQueue: [song],
      playbackIntent: true,
      isPlaying: false,
      playbackStatus: 'idle',
    });

    usePlayerStore.getState().togglePlayPause();

    expect(usePlayerStore.getState().playbackIntent).toBe(false);
  });

  it('accumulates real-time listenedSeconds via timeupdate and ranks topSongs accordingly', async () => {
    const audio = new FakeAudio();
    const songA = { ...localSong('song-A'), playCount: 5, listenedSeconds: 10 };
    const songB = { ...localSong('song-B'), playCount: 1, listenedSeconds: 30 };
    usePlayerStore.setState({ queue: [songA, songB], currentSong: songA, playbackQueue: [songA, songB] });
    service = new AudioService({ audio });

    usePlayerStore.getState().playSong(songA);
    await flush();
    audio.emit('playing');

    // Simulate timeupdate advancing by 1s intervals
    audio.currentTime = 1;
    audio.emit('timeupdate');
    audio.currentTime = 2;
    audio.emit('timeupdate');

    const updatedSongA = usePlayerStore.getState().queue.find((s) => s.id === songA.id);
    expect(updatedSongA?.listenedSeconds).toBeGreaterThanOrEqual(11);

    // Verify songB with higher listenedSeconds (30s) is ranked #1 in topSongs over songA (11s) despite lower playCount
    const top = usePlayerStore.getState().topSongs;
    expect(top[0].id).toBe(songB.id);
    expect(top[1].id).toBe(songA.id);
  });

  it('increments playCount when song loops', async () => {
    const audio = new FakeAudio();
    const song = localSong('loop-test');
    usePlayerStore.setState({ queue: [song], currentSong: song, playbackQueue: [song], isLooping: true });
    service = new AudioService({ audio });

    usePlayerStore.getState().playSong(song);
    await flush();
    audio.emit('playing');
    const initialPlayCount = usePlayerStore.getState().queue.find((s) => s.id === song.id)?.playCount ?? 0;

    // Simulate song ended while looping
    audio.emit('ended');
    await flush();

    const loopedPlayCount = usePlayerStore.getState().queue.find((s) => s.id === song.id)?.playCount ?? 0;
    expect(loopedPlayCount).toBe(initialPlayCount + 1);
  });

  it('increments playCount EXACTLY once per single play action (play -> pause -> resume)', async () => {
    const audio = new FakeAudio();
    const song = { ...localSong('single-play-test'), playCount: 0 };
    usePlayerStore.setState({ queue: [song], currentSong: song, playbackQueue: [song] });
    service = new AudioService({ audio });

    // Step 1: User plays song
    usePlayerStore.getState().playSong(song);
    await flush();
    audio.emit('playing');
    expect(usePlayerStore.getState().queue[0].playCount).toBe(1);

    // Step 2: Pause and resume should NOT increment playCount again for same selection
    usePlayerStore.getState().togglePlayPause();
    await flush();
    audio.emit('pause');

    usePlayerStore.getState().togglePlayPause();
    await flush();
    audio.emit('playing');

    // playCount must remain EXACTLY 1!
    expect(usePlayerStore.getState().queue[0].playCount).toBe(1);
  });
});
