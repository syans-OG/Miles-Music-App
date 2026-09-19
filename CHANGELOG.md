# Changelog

All notable changes to Miles Music Player are documented here.

## [1.0.8] - 2026-09-19

### Added
- Offline queued downloads: concurrency-managed download scheduler, download activity panel with progress, and overwrite handling.
- Library support for local `.opus` files.
- Theme presets (Minimal, Emerald, Sunset) plus a custom color wheel; hardcoded colors migrated to theme tokens across drawer, dialogs, and widgets.
- Import URL autofill on Ctrl+V: pasting over the import panel fills the URL and starts importing without pressing Enter.
- Playlist header actions and the drag-and-reorder stack behind them.

### Changed
- YouTube streams now prefer Opus (webm) with m4a as fallback.
- Per-tick time updates no longer write to the persisted store (5s checkpoint sync) — playbackHotPath benchmark: 438.5ms → 15.2ms persisted-set time, storage writes 288 → 18.
- Embedded cover decode capped at 1024px and stream hashing via `fs::copy` — lower peak RAM on import.
- Drawer/cabinet stays solid in transparent/floating mode via the `--th-cabinet` token.
- "Transparent" moved out of the Mode row into its own ON/OFF toggle.
- User-facing UI strings translated to English (frontend + Rust).
- Add Songs modal list virtualized for large libraries.
- Rust logger initialized (`env_logger`) so YouTube/process diagnostics are actually written.
- Renderer JS heap bounded and WebView2 background services disabled (networking, component update, sync, breakpad, first-run/default-browser checks).

### Fixed
- Local import duration timeout: duration lookup falls back to 180s after 8s instead of hanging the import.
- Local import save errors now log the real Tauri error and warn about disk space/permissions instead of mislabeled "invalid file".
- Silent failures surfaced: localStorage quota, cover write/resize errors, media-proxy boundaries, zero-network cover fallback, YouTube import detail, migration drop warnings.
- Dev-only dependency bump: vitest to 4.1.11 (GHSA-82fw-gwwq-j7x9).

## [1.0.7] - 2026-09-09

### Added
- Multi-select "Add to Playlist" action: batch-add selected songs to an existing or new playlist, skipping duplicates.
- Drag-and-drop reorder for playlist tracks and playback queue using `@dnd-kit` (vertical list sorting, keyboard accessible).
- Regression tests for batch playlist add, playlist reorder, and playback queue reorder.

### Changed
- Queue reorder now uses a drag handle instead of Move Up/Down chevron buttons.

### Fixed
- Fixed Spotify import producing tracks that could not be matched or played (`SpotifyTrackMatchResult` was serialized snake_case while the frontend read camelCase fields — `videoId`, `thumbnailUrl`, `canonicalUrl` were always `undefined`).

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
