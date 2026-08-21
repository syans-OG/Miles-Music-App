# Cross-platform sidecar release design

## Understanding summary

- Miles must release installers for Windows x64, macOS Apple Silicon, macOS Intel, and Linux x64.
- The bundled `yt-dlp` and Deno binaries must match the Rust/Tauri build target.
- The working Windows release must remain supported without weakening its integrity checks.
- Sidecar downloads, manifests, backend tests, and Tauri packaging must use the same target triple.
- A missing binary, mismatched target, or invalid checksum must stop the release before packaging.
- Signing and notarization are outside this change; Linux ARM64 is not a release target yet.

## Assumptions

- This pipeline-only change does not alter application performance or user data handling.
- SHA-256 verification remains mandatory on every supported operating system.
- GitHub Actions provides native runners for each release architecture.
- The four supported target manifests are maintained together with dependency version updates.

## Final design

Each supported Rust target has a dedicated manifest under `src-tauri/sidecars/`. The manifest owns the platform-specific download URL, publisher asset checksum, bundled filename, runtime filename, and executable checksum for both sidecars.

The download script selects a manifest from `TAURI_TARGET` (or the host target), verifies the downloaded publisher asset, extracts it when required, verifies the executable, and installs the target-suffixed binary. The Rust build selects the matching manifest directly from Cargo's `TARGET` and embeds that exact file for runtime validation. Windows requires `.exe` runtime names; macOS and Linux require extensionless names.

The release workflow has one matrix row per supported target. Every row downloads its own sidecars and runs Rust tests and Tauri packaging with the same target triple. Bundle formats are explicit: NSIS/MSI on Windows, DMG on macOS, and DEB/AppImage on Linux. This keeps target selection explicit, prevents a Windows manifest from reaching a Unix build, and avoids unsupported package formats from `targets: all`.

## Testing and failure handling

- Unit tests cover target-specific metadata rules and tampered binaries on every OS.
- The downloader rejects unsupported targets, untrusted URLs, and both publisher-asset and executable checksum mismatches.
- CI runs frontend build/tests plus target-specific Rust tests before packaging.
- Rust formatting, Clippy, and configuration tests guard the release workflow and manifest set.

## Decision log

1. Use one manifest per target instead of a combined manifest or CI-only metadata. This is easier to audit and makes target mistakes explicit.
2. Support Windows x64, both macOS architectures, and Linux x64. Linux ARM64 is deferred.
3. Preserve SHA-256 verification on every platform rather than bypassing Unix checks.
4. Run download, tests, and packaging against the same matrix target.
5. Keep code signing and Apple notarization outside this build-correctness fix.
