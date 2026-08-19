# Miles v1.0.4 Release Validation

Date: 2026-08-19

## Automated gates

| Gate | Result |
| --- | --- |
| Frontend test suite | Pass — 58 tests |
| TypeScript and Vite production build | Pass |
| Rust format | Pass |
| Rust Clippy | Pass with warnings denied |
| Rust offline tests | Pass — 31 unit and 14 integration tests; 1 live test ignored by default |
| Live public YouTube smoke | Pass — 65 playlist entries, 0 skipped, 189-second track resolved |
| npm dependency audit | Pass — 0 vulnerabilities |
| yt-dlp checksum | Pass — pinned `2026.07.04` |
| Deno checksum | Pass — pinned `2.9.4` |
| Required third-party licenses | Pass — 4 files present |
| Version synchronization | Pass — npm, Cargo, Tauri, and lockfiles report `1.0.4` |
| Repository secret/junk scan | Pass — no tracked credentials or build artifacts found |
| Post-build process cleanup | Pass — no Miles, yt-dlp, or Deno process remained |

## Installer artifact

- Path: `src-tauri/target/release/bundle/nsis/Miles_1.0.4_x64-setup.exe`
- Size: 51,557,147 bytes (49.17 MiB)
- SHA256: `ef1adf42e260cf7cf316b67b272475e9a063a1414a09f1f4bf213e172c09fe43`
- Executable product/file version: `1.0.4`
- Authenticode: not signed

The installer is intentionally ignored by Git and should be uploaded as a GitHub Release asset after the manual gate passes.

## Manual gate — pending

1. Install `Miles_1.0.4_x64-setup.exe` over the existing v1.0.3 installation.
2. Confirm existing local songs, playlists, favorites, play counts, settings, and resume state remain available.
3. Import a Spotify playlist; verify progress, first-track autoplay, skip reporting, and no duplicates after cancel/retry.
4. Play the same Spotify track twice and play a prefetched next track; verify the YouTube cover remains valid.
5. Restart Miles and verify upgraded covers and library state persist.
6. Play one public YouTube video, one YouTube playlist entry, and one local audio file.
7. Switch through all three player modes and open/close every drawer tab.
8. Exit Miles and confirm no yt-dlp or Deno process remains.

Do not create the `v1.0.4` tag or GitHub Release until this manual gate is confirmed.
