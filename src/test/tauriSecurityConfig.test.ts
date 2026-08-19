import { describe, expect, it } from 'vitest';

import tauriConfig from '../../src-tauri/tauri.conf.json';

describe('Tauri image CSP', () => {
  it('allows only the Spotify host still used by resource artwork', () => {
    const imageSources = tauriConfig.app.security.csp['img-src'].split(/\s+/);

    expect(imageSources).toContain('https://i.scdn.co');
    expect(imageSources).not.toContain('https://*.spotifycdn.com');
    expect(imageSources).not.toContain('https://*.scdn.co');
  });

  it('routes remote audio through the bounded Rust loopback proxy', () => {
    const mediaSources = tauriConfig.app.security.csp['media-src'].split(/\s+/);

    expect(mediaSources).toContain('http://127.0.0.1:*');
    expect(mediaSources).not.toContain('https://*.googlevideo.com');
  });
});
