import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '../stores/usePlayerStore';

let lastSentKey = '';
let lastErrorWarnAt = 0;

const warnDiscordError = (message: string, error: unknown) => {
  const now = Date.now();
  if (now - lastErrorWarnAt < 60_000) return;
  lastErrorWarnAt = now;
  console.warn(`[DiscordRPC] ${message}:`, error);
};

export const syncDiscordActivity = async (force = false) => {
  const state = usePlayerStore.getState();
  const currentSong = state.currentSong;
  const enabled = state.enableDiscordRpc;
  const clientId = state.discordClientId?.trim() || '1534752337543954512';
  const isPlaying = state.isPlaying;

  if (!enabled) {
    if (lastSentKey !== 'disabled') {
      lastSentKey = 'disabled';
      try {
        await invoke('set_discord_activity', {
          title: '',
          artist: '',
          coverUrl: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          enabled: false,
          clientId,
        });
      } catch (error) {
        warnDiscordError('activity disable update failed', error);
      }
    }
    return;
  }

  const title = currentSong ? currentSong.title : 'Miles Music Player';
  const artist = currentSong ? currentSong.artist : 'Listening to Music';
  const rawCover = (currentSong?.offline?.remoteCoverUrl || currentSong?.coverUrl) ?? '';
  const isPublicWebCover =
    (rawCover.startsWith('http://') || rawCover.startsWith('https://')) &&
    !rawCover.includes('localhost') &&
    !rawCover.includes('127.0.0.1') &&
    !rawCover.includes('asset.localhost');
  const coverUrl = isPublicWebCover ? rawCover : null;
  const duration = currentSong ? Math.floor(state.duration || currentSong.duration || 0) : 0;
  const currentTime = Math.floor(state.currentTime);

  const currentKey = `${title}|${artist}|${coverUrl}|${isPlaying}|${duration}|${clientId}`;
  if (!force && currentKey === lastSentKey) return;
  lastSentKey = currentKey;

  try {
    await invoke('set_discord_activity', {
      title,
      artist,
      coverUrl,
      isPlaying,
      currentTime,
      duration,
      enabled: true,
      clientId,
    });
  } catch (error) {
    warnDiscordError('activity update failed', error);
  }
};
