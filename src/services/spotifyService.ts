import { invoke } from '@tauri-apps/api/core';
import type { SpotifyPlaylistImport } from '../types/spotify';

const SPOTIFY_URL_PATTERN = /(?:https?:\/\/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)|spotify:(playlist|album|track):([a-zA-Z0-9]+))/;

export const isSpotifyUrl = (url: string): boolean => {
  const clean = url.trim();
  return SPOTIFY_URL_PATTERN.test(clean);
};

export const importSpotifyResource = async (url: string): Promise<SpotifyPlaylistImport> => {
  try {
    const result = await invoke<SpotifyPlaylistImport>('fetch_spotify_playlist', { url: url.trim() });
    return result;
  } catch (error: any) {
    if (typeof error === 'object' && error !== null && error.message) {
      throw new Error(error.message);
    }
    throw new Error('Failed to import Spotify data. Please make sure the link is valid and public.');
  }
};
