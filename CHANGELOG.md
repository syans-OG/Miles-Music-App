# Changelog

All notable changes to Miles Music Player are documented here.

## [1.0.6] - 2026-08-20

### Added
- Dedicated Playlist Detail View (Studio Hero Inset) with full tracklist, instant track removals, and library song adder modal.
- Playlist rename feature directly in the detail view header.
- Multi-select batch deletion mode for CD collection with floating action bar and safe file cleanup.
- Queue control ribbon: Repeat Queue toggle, upcoming queue shuffle, and queue clear icon buttons.
- Native Single Instance lock (`tauri-plugin-single-instance`) with automatic window restore from System Tray and tactile visual nudge.
- Multi-platform matrix release CI/CD workflow for Windows, macOS (Apple Silicon & Intel), and Linux (Ubuntu).

### Fixed
- Fixed single track repeat loop pausing glitch.
- Fixed Spotify and YouTube thumbnail resolution to prevent gray camera 404 placeholder covers.
- Compact proportional UI scaling for Mode 1 (Console Bar), Mode 2 (Turntable), and Mode 3 (Micro Bubble).
- Tightened desktop screen corner snapping and eliminated drawer bottom text clipping.
- Removed outer shadows from Mode 3 floating bubble.

## [1.0.5] - 2026-08-19

### Fixed

- Seamless Spotify playlist playback and autoplay: background import tasks no longer cancel active stream resolutions.
- Resilient audio streaming: automatic fallback to dynamic search (`ytsearch1:`) for geoblocked or unavailable YouTube video IDs.
- Spotify metadata normalization: improved track duration and URI format parsing.

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
