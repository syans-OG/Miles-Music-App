# Miles v1.0.4 Release Gate

## Understanding summary

- Release Miles as patch version `1.0.4` for Windows x64.
- Preserve compatibility with persisted `1.0.3` user libraries and settings.
- Include the latest Spotify import, cancel/retry, cover, and playback-cache fixes.
- Validate local audio, public YouTube, and public Spotify integration without accounts or API keys.
- Keep installers and generated build output out of source control; publish installers as GitHub Release assets later.
- Treat interactive installer installation and final visual smoke testing as a user-confirmed release gate.

## Assumptions

- The release uses the existing pinned yt-dlp and Deno sidecars.
- No storage schema change is required for this patch release.
- The existing Windows NSIS target remains the distribution format.
- Live YouTube requests remain an explicit manual/ignored smoke test because CI is designed to work offline.

## Approaches considered

1. **Complete patch release gate (selected):** audit, version bump, automated validation, installer build, then manual installer smoke test.
2. Fast build from the current commit: quicker, but risks version drift or an installer-only regression.

## Decision log

- Use semantic version `1.0.4` consistently across npm, Cargo, Tauri, and lockfiles.
- Add a repository changelog so release content is durable and reusable for GitHub Release notes.
- Remove the obsolete Spotify image CDN wildcard because per-track Spotify oEmbed lookup was removed.
- Build NSIS only; do not commit the installer.
- Do not create the release tag until the generated installer passes the user's manual installation smoke test.

## Final design

The automated gate checks tracked files and common secret patterns, dependency vulnerabilities, frontend tests and TypeScript production build, Rust formatting, Clippy with warnings denied, Rust tests, sidecar checksums, license files, and repository cleanliness. After the version bump, Tauri builds an NSIS installer. The artifact path, hash, and size are recorded for the manual gate. The release is ready to commit/tag only after the user confirms install, launch, upgrade persistence, Spotify repeated playback, YouTube playback, and local playback.
