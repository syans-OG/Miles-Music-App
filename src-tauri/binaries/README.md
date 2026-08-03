# Bundled sidecars

The Windows x64 sidecars are pinned in `../sidecars.json` and verified with
SHA256 during every clean Rust build and before the first YouTube operation in
each application process.

The executables are intentionally excluded from Git. From the repository root,
run `powershell -ExecutionPolicy Bypass -File scripts/download-sidecars.ps1` to
download the pinned official assets and verify them before use.

| Component | Version | Bundled file |
| --- | --- | --- |
| yt-dlp | 2026.07.04 | `yt-dlp-x86_64-pc-windows-msvc.exe` |
| Deno | 2.9.4 | `deno-x86_64-pc-windows-msvc.exe` |

To update either component with a Miles release:

1. Download the pinned asset and publisher checksum from its official GitHub release.
2. Verify the downloaded asset before extracting or copying it here.
3. Update the version, source URL, publisher asset checksum, and executable checksum in `../sidecars.json`.
4. Refresh the matching notices under `../licenses`.
5. Run `cargo test` and a Tauri bundle build. A stale or altered executable must fail the Rust build.

Do not add cookies, downloaded media, stream URLs, or user-specific configuration to this directory.
