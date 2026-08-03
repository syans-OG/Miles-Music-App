import { describe, expect, it } from 'vitest';

import { getDisplayCoverUrl } from '../utils/coverImage';

describe('getDisplayCoverUrl', () => {
  it('uses a compact YouTube thumbnail for display', () => {
    expect(getDisplayCoverUrl('https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg'))
      .toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
  });

  it('limits Unsplash display width', () => {
    const result = new URL(getDisplayCoverUrl('https://images.unsplash.com/photo-1?w=1200&q=90', 128));
    expect(result.searchParams.get('w')).toBe('128');
    expect(result.searchParams.get('q')).toBe('72');
  });

  it('leaves local asset URLs unchanged', () => {
    expect(getDisplayCoverUrl('asset://localhost/library/cover.jpg')).toBe('asset://localhost/library/cover.jpg');
  });
});
