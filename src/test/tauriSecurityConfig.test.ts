import { describe, expect, it } from 'vitest';

import tauriConfig from '../../src-tauri/tauri.conf.json';

describe('Tauri image CSP', () => {
  it('allows only the Spotify host still used by resource artwork', () => {
    const imageSources = tauriConfig.app.security.csp['img-src'].split(/\s+/);

    expect(imageSources).toContain('https://i.scdn.co');
    expect(imageSources).not.toContain('https://*.spotifycdn.com');
    expect(imageSources).not.toContain('https://*.scdn.co');
  });
});
