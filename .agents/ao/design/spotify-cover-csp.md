# Spotify Cover CSP and Fallback

## Understanding summary

- Spotify cover art must be visible immediately after import.
- Tauri's CSP remains restrictive and permits only the official Spotify image host.
- Broken remote covers fall back consistently in every player mode and drawer view.
- A failed fallback must not create an error loop.
- Playback, matching, persistence, and import behavior remain unchanged.
- The solution adds no runtime dependency and has negligible memory impact.

## Assumptions

- Imported Spotify artwork is served from `https://i.scdn.co`.
- The existing Unsplash default cover remains the application fallback.
- Local asset and YouTube thumbnail handling remain unchanged.

## Decision log

- Add only `https://i.scdn.co` to `img-src`; reject a broad Spotify wildcard.
- Keep fallback behavior in the shared cover utility rather than duplicating logic.
- Apply the shared error handler to every cover image surface.
- Protect both CSP configuration and fallback behavior with regression tests.

## Final design

`getDisplayCoverUrl` continues to normalize display URLs. A shared image-error
handler clears its native `onerror` callback before assigning the existing
default cover, preventing repeated failures. All cover `<img>` elements use the
handler. A configuration test asserts that the exact Spotify CDN origin remains
present in Tauri's `img-src` directive.
