const DEFAULT_COVER_URL = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=192&auto=format&fit=crop&q=72';

const NEUTRAL_COVER_DATA_URI =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">' +
      '<rect width="192" height="192" fill="#1b2330"/>' +
      '<circle cx="96" cy="112" r="30" fill="none" stroke="#9fb4c8" stroke-width="8"/>' +
      '<rect x="113" y="58" width="14" height="62" rx="7" fill="#9fb4c8"/>' +
      '<path d="M127 74c14 4 18 14 16 24" fill="none" stroke="#9fb4c8" stroke-width="8" stroke-linecap="round"/>' +
      '</svg>',
  );

const YOUTUBE_THUMBNAIL_HOSTS = new Set(['i.ytimg.com', 'img.youtube.com']);

export const handleCoverImageError = (event: { currentTarget: HTMLImageElement }) => {
  const image = event.currentTarget;
  image.onerror = null;
  if (image.src.startsWith('data:')) return;
  if (image.src === DEFAULT_COVER_URL) {
    image.src = NEUTRAL_COVER_DATA_URI;
    return;
  }
  image.src = DEFAULT_COVER_URL;
  image.onerror = () => {
    image.onerror = null;
    image.src = NEUTRAL_COVER_DATA_URI;
  };
};

export const getDisplayCoverUrl = (source: string | undefined, width = 192): string => {
  const value = source || DEFAULT_COVER_URL;

  try {
    const url = new URL(value);
    if (YOUTUBE_THUMBNAIL_HOSTS.has(url.hostname)) {
      // Keep hqdefault or maxresdefault, replace default.jpg (low res 120x90) with hqdefault
      if (url.pathname.endsWith('/default.jpg') || url.pathname.endsWith('/default.webp')) {
        url.pathname = url.pathname.replace(/\/default\.(?:jpg|webp)$/i, '/hqdefault.jpg');
      }
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
