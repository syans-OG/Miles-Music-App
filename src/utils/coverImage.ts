const DEFAULT_COVER_URL = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=192&auto=format&fit=crop&q=72';

const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com']);

export const getDisplayCoverUrl = (source: string | undefined, width = 192): string => {
  const value = source || DEFAULT_COVER_URL;

  try {
    const url = new URL(value);
    if (YOUTUBE_THUMBNAIL_HOSTS.has(url.hostname)) {
      url.pathname = url.pathname.replace(/\/(?:maxresdefault|sddefault|hqdefault)\.(?:jpg|webp)$/i, '/mqdefault.jpg');
      return url.toString();
    }

    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('w', String(Math.max(96, Math.min(width, 320))));
      url.searchParams.set('q', '72');
      return url.toString();
    }
  } catch {
    return value;
  }

  return value;
};
