import { describe, expect, it } from 'vitest';

import { getDisplayCoverUrl, handleCoverImageError } from '../utils/coverImage';

describe('getDisplayCoverUrl', () => {
  it('preserves reliable YouTube thumbnail and upgrades default.jpg', () => {
    expect(getDisplayCoverUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    expect(getDisplayCoverUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('limits Unsplash display width', () => {
    const result = new URL(getDisplayCoverUrl('https://images.unsplash.com/photo-1?w=1200&q=90', 128));
    expect(result.searchParams.get('w')).toBe('128');
    expect(result.searchParams.get('q')).toBe('72');
  });

  it('leaves local asset URLs unchanged', () => {
    expect(getDisplayCoverUrl('asset://localhost/library/cover.jpg')).toBe('asset://localhost/library/cover.jpg');
  });

  it('replaces a broken cover with the default, then a zero-network fallback', () => {
    const image = document.createElement('img');
    image.src = 'https://i.scdn.co/image/broken';
    image.onerror = () => undefined;

    handleCoverImageError({ currentTarget: image });

    expect(image.src).toBe(getDisplayCoverUrl(undefined));
    expect(typeof image.onerror).toBe('function');

    // If the network default also fails, the final layer disables native errors
    (image.onerror as () => void)();
    expect(image.onerror).toBeNull();
    expect(image.src.startsWith('data:image/svg+xml')).toBe(true);
  });
});
