import type { Song } from '../types/player';

export const SUNFLOWER_VIDEO_ID = 'ApXoWvfEYVU';

export const SUNFLOWER_DEFAULT_SONG: Song = {
  id: `yt-${SUNFLOWER_VIDEO_ID}`,
  title: 'Post Malone, Swae Lee - Sunflower (Spider-Man: Into the Spider-Verse)',
  artist: 'Post Malone',
  album: 'YouTube',
  coverUrl: `https://i.ytimg.com/vi/${SUNFLOWER_VIDEO_ID}/maxresdefault.jpg`,
  source: {
    kind: 'youtube',
    videoId: SUNFLOWER_VIDEO_ID,
    canonicalUrl: `https://www.youtube.com/watch?v=${SUNFLOWER_VIDEO_ID}`,
    availability: 'available',
  },
  duration: 162,
  playCount: 0,
};

export const LEGACY_DEFAULT_SONG_IDS = new Set(['song-1', 'song-2', 'song-3', 'song-4']);
export const LEGACY_DEFAULT_PLAYLIST_IDS = new Set(['pl-1', 'pl-2', 'pl-3']);
