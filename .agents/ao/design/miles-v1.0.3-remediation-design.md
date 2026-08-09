# Miles Music Player v1.0.3 Remediation Design

## Understanding summary

- Restore the Rust CI quality gates without changing the public frontend command contract.
- Persist Discord Rich Presence preferences through Zustand storage.
- Stop sending Discord IPC updates for ordinary one-second playback progress.
- Keep meaningful Discord updates for track, play/pause, seek, duration, and setting changes.
- Validate Spotify URLs and IDs with strict allowlists in TypeScript and Rust.
- Bound Spotify HTTP responses and handle non-success status codes safely.
- Preserve the existing Spotify-metadata-to-YouTube-playback behavior.

## Assumptions

- Windows and Tauri remain the primary runtime.
- No new dependency is required unless the existing stack cannot implement a safe bounded response.
- UI design, YouTube playback behavior, and local-library persistence remain out of scope.
- Runtime CPU and IPC reductions are preferred over broad architectural refactoring.

## Decision log

- Use a targeted patch instead of a medium or full refactor to minimize regression risk.
- Keep the existing Tauri command name and frontend payload contract for Discord RPC.
- Drive Discord updates from meaningful state changes; Discord timestamps render ordinary elapsed progress.
- Use strict protocol, host, resource-type, and identifier allowlists for Spotify input.
- Add regression tests before production fixes and run all frontend and Rust quality gates afterward.

## Implementation design

1. Extract testable persistence and Spotify validation boundaries where needed.
2. Add failing tests for Discord preference persistence, Discord progress deduplication, and Spotify URL boundaries.
3. Replace the Discord RPC argument-heavy internal Rust API with a request value object while keeping the Tauri command interface stable.
4. Remove ordinary `currentTime` ticks from Discord activity identity and introduce an explicit seek/activity revision signal.
5. Parse Spotify URLs structurally on both sides, reject credentials, ports, fragments, extra path segments, invalid types, and invalid IDs.
6. Check Spotify HTTP status before parsing and read the response with a fixed byte ceiling.
7. Format Rust and run frontend tests/build plus Rust fmt, Clippy, and tests.

