# Miles Music Player

Miles is a lightweight cross-platform desktop music player built with Tauri, Rust, React, and TypeScript. It plays managed local audio files, public YouTube videos and playlists, and public Spotify links (playlists, albums, tracks) through a compact, three-mode Hi-Fi vinyl interface.

## Download

[Download the latest installer](https://github.com/syans-OG/Miles-Music-App/releases/latest)

Miles targets Windows x64, macOS Apple Silicon, macOS Intel, and Linux x64. Release installers are published as GitHub Release assets and are not committed to the source repository.

## Features

- Three compact player modes: control bar, vinyl widget, and micro bubble.
- Spotify link import: import public Spotify playlists, albums, and single tracks without login or API keys.
- YouTube video and playlist import with lazy audio-stream resolution.
- Discord Rich Presence (RPC): display currently playing track, artist, duration, playback status, and custom artwork on Discord.
- Managed local library with metadata and embedded-cover extraction.
- Automatic track-level album cover art resolution.
- Full English UI localization across console bar, music drawer, settings, and notifications.
- Playlist, queue, favorite, play-count, resume, and always-on-top state persistence.
- Bounded imports: up to 128 MB per local file and 50 files per selection.
- No telemetry, account requirement, Google API key, YouTube/Spotify login, or tracking cookies.

## Security and privacy

Miles stores library files and preferences locally. YouTube and Spotify stream URLs remain in volatile memory and are never persisted. The integration validates hosts and IDs, isolates sidecar execution, limits concurrent processes, and terminates timed-out process trees.

The pinned yt-dlp and Deno sidecars are downloaded from their official GitHub releases and verified with SHA256 checksums at download time, clean build time, and runtime. Never add cookies, downloaded media, user library files, or resolved stream URLs to this repository.

See [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## Build from source

Requirements:

- Node.js 22 or newer
- Rust stable with the toolchain for your target
- Tauri's system prerequisites for Windows, macOS, or Linux

```powershell
git clone https://github.com/syans-OG/Miles-Music-App.git
cd Miles-Music-App
npm ci
node scripts/download-sidecars.mjs
npm run tauri dev
```

Create a release installer:

```powershell
npm run tauri -- build
```

Run validation:

```powershell
npm run build
npm test
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Third-party components

Binary distributions include yt-dlp and Deno. Their pinned versions, source URLs, and checksums are declared in `src-tauri/sidecars/`; applicable notices are kept in `src-tauri/licenses/`.

Miles is not affiliated with or endorsed by Spotify, YouTube, yt-dlp, Deno, or Google. Use the application only for personal content or content you are authorized to access, in accordance with applicable terms and law.

## License

Miles source code is available under the [MIT License](LICENSE). Bundled third-party components remain subject to their respective licenses.
