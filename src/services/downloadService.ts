import { invoke } from '@tauri-apps/api/core';

import type { DownloadedTrack } from '../types/youtube';
import { toYoutubeServiceError } from './youtubeService';

export const downloadYoutubeTrack = async (videoId: string): Promise<DownloadedTrack> => {
  try {
    return await invoke<DownloadedTrack>('download_youtube_track', { videoId });
  } catch (error) {
    throw toYoutubeServiceError(error);
  }
};

export const cancelYoutubeDownload = async (): Promise<void> => {
  await invoke('cancel_youtube_download');
};