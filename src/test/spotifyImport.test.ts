import { describe, expect, it } from 'vitest';
import { isSpotifyUrl } from '../services/spotifyService';

describe('spotifyImport', () => {
  it('identifies valid Spotify playlist, album, and track URLs correctly', () => {
    expect(isSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
    expect(isSpotifyUrl('https://open.spotify.com/playlist/2OQ9R5GkQpgcReswEAmBNH')).toBe(true);
    expect(isSpotifyUrl('https://open.spotify.com/album/4eLPsYPBmXABThSJ8zWzBB')).toBe(true);
    expect(isSpotifyUrl('https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH')).toBe(true);
    expect(isSpotifyUrl('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M')).toBe(true);
  });

  it('rejects invalid or non-Spotify URLs', () => {
    expect(isSpotifyUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false);
    expect(isSpotifyUrl('https://example.com/playlist/123')).toBe(false);
    expect(isSpotifyUrl('random string')).toBe(false);
    expect(isSpotifyUrl('prefix https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH suffix')).toBe(false);
    expect(isSpotifyUrl('https://evil.example/open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH')).toBe(false);
    expect(isSpotifyUrl('http://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH')).toBe(false);
    expect(isSpotifyUrl('https://user:pass@open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH')).toBe(false);
    expect(isSpotifyUrl('https://open.spotify.com/track/short')).toBe(false);
    expect(isSpotifyUrl('https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH/extra')).toBe(false);
    expect(isSpotifyUrl('https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH#fragment')).toBe(false);
    expect(isSpotifyUrl('spotify:track:0VjIdWI8SuT4Ytz7vLmrCH:extra')).toBe(false);
  });
});
