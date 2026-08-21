# Bundled sidecars

The supported platform sidecars are pinned in `../sidecars/`. Rust selects the
manifest matching Cargo's build target and verifies its SHA-256 metadata during
every clean build and before the first YouTube operation in each process.

The executables are intentionally excluded from Git. From the repository root,
run `powershell -ExecutionPolicy Bypass -File scripts/download-sidecars.ps1` to
download the pinned official assets and verify them before use.

Supported targets are Windows x64, macOS Apple Silicon, macOS Intel, and Linux
x64. Set `TAURI_TARGET` before running `node scripts/download-sidecars.mjs` to
prepare a target other than the current host.

To update either component with a Miles release:

1. Download the pinned asset and publisher checksum from its official GitHub release.
2. Verify the downloaded asset before extracting or copying it here.
3. Update the version, source URL, publisher asset checksum, and executable checksum in every affected manifest under `../sidecars/`.
4. Refresh the matching notices under `../licenses`.
5. Run `cargo test` and a Tauri bundle build. A stale or altered executable must fail the Rust build.

Do not add cookies, downloaded media, stream URLs, or user-specific configuration to this directory.
