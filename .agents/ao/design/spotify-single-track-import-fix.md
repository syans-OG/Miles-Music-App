# Spotify Single-Track Import Fix

## Understanding summary

- A Spotify `track` URL imports one song and never creates an application playlist.
- The imported song is deduplicated in the library and playback queue, selected, and played.
- Spotify `playlist` URLs retain the existing playlist import behavior.
- Spotify `album` URLs remain represented as playlist collections because Miles has no album collection type.
- The Rust response is the final source of truth for the Spotify resource type.
- UI design, YouTube playback resolution, and local-file behavior remain unchanged.

## Assumptions

- The existing Tauri command name remains stable.
- The response can gain a required `resource_type` field because backend and frontend ship together.
- Single-track behavior should mirror the existing single-video YouTube import flow.

## Decision log

- Add an explicit `resource_type` response field instead of inferring from track count.
- Detect the type in TypeScript only for immediate loading-state presentation; trust the backend response for storage behavior.
- Keep album imports as playlist collections rather than adding a new album domain model.

## Final design

1. Define `SpotifyResourceType` as `track | album | playlist` in TypeScript.
2. Add `resource_type` to the Rust and TypeScript import response structures.
3. Add a strict TypeScript resource detector and keep `isSpotifyUrl` as its boolean wrapper.
4. For `track`, add or reuse the song, append it to playback queue only when absent, select it, and start playback without changing playlists or forcing the Playlist tab.
5. Preserve the current album/playlist collection path.
6. Add store-level regression coverage for the reported Spotify track URL and rerun all project quality gates.

