# Changelog

All notable changes to Miles Music Player are documented here.

## [1.0.4] - 2026-08-19

### Added

- Public Spotify track, album, and playlist import with progressive YouTube matching.
- Import progress, cancellation, retry, skip reporting, and duplicate-safe resume behavior.

### Fixed

- Preserve playlist imports while preventing duplicates after cancel and retry.
- Keep the import panel open when users reopen it during background matching.
- Use playlist artwork as the initial Spotify placeholder, then persist the resolved YouTube cover after playback.
- Keep repeated and prefetched playback covers stable by caching the exact resolved thumbnail with the stream.
- Remove unavailable or unsupported matched tracks instead of persisting broken library entries.
- Prevent transient sidecar command windows from flashing on Windows.
- Keep CD detail menus above adjacent artwork and drawer content.

### Security and maintenance

- Keep Spotify and YouTube URL validation, bounded imports, isolated sidecars, timeouts, and process-tree cleanup enabled.
- Remove the unused Spotify per-track oEmbed request and its image CDN permission.
