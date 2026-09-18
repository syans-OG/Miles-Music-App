<p align="center">
  <img src="src-tauri/icons/miles-logo-master.png" width="120" alt="Miles logo" />
</p>

<h1 align="center">Miles Music Player</h1>

<p align="center">
  <a href="https://github.com/syans-OG/Miles-Music-App/releases/latest"><img src="https://img.shields.io/github/v/release/syans-OG/Miles-Music-App" alt="Latest release" /></a>
  <a href="https://github.com/syans-OG/Miles-Music-App/actions/workflows/ci.yml"><img src="https://github.com/syans-OG/Miles-Music-App/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" />
</p>

> A lightweight, local-first desktop music player for your audio files, YouTube, and Spotify links — no accounts, no telemetry, no API keys.

## Features

- **Three player modes** — Full control bar, floating vinyl Widget, and Mini micro-bubble, with magnetic edge snapping and always-on-top.
- **Transparent Floating UI** — panels dissolve away so only the controls float over your desktop; empty areas stay click-through.
- **Themes** — Dark / Light / Transparent, curated presets (Minimal, Emerald, Sunset), plus a custom color wheel for your own accent.
- **Offline downloads** — download YouTube tracks for offline playback with a queued, cancellable task list; each song keeps its own file.
- **Link imports** — paste public YouTube videos/playlists or Spotify tracks/albums/playlists; matching and deduplication handled automatically.
- **Local library** — drag-and-drop MP3/audio import with metadata and cover extraction, content-hash deduplication, playlists with drag-reorder, favorites, top songs, and resume.
- **Discord Rich Presence** — show the current track, artist, and artwork on Discord (optional, configurable client ID).
- **System tray** — play/pause/next and mode switching without opening the window.

## Download

Grab the installer for your platform from the [latest release](https://github.com/syans-OG/Miles-Music-App/releases/latest):

| Platform | Asset |
| -------- | ----- |
| Windows x64 | `.msi` / `-setup.exe` |
| macOS Apple Silicon | `.dmg` (aarch64) |
| macOS Intel | `.dmg` (x64) |
| Linux x64 | `.AppImage` / `.deb` |

## Quick start

Prerequisites: **Node.js 22+**, a **Rust stable** toolchain, and the [Tauri system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```powershell
git clone https://github.com/syans-OG/Miles-Music-App.git
cd Miles-Music-App
npm ci
node scripts/download-sidecars.mjs
npm run tauri dev
```

> [!NOTE]
> `download-sidecars.mjs` is a required one-time step: it fetches the pinned `yt-dlp` + Deno sidecars and verifies their SHA256 checksums.

Web-only preview (no desktop shell, Tauri APIs stubbed out):

```powershell
npm run dev
```

## Usage

- **Switch modes** from the window controls or tray: Full for the drawer library, Widget/Mini to keep music floating beside your work.
- **Import links** with the `+` button in the control bar — YouTube and Spotify URLs are detected automatically.
- **Download for offline** from any song's `···` menu, or select several discs and hit the download button; progress lives in the pill at the bottom.
- **Theme it** from the gear menu: pick Dark / Light / **Transparent**, a preset, or drag the custom color wheel until it feels like yours.

## Build & validate

Release installer:

```powershell
npm run tauri -- build
```

Run all checks before pushing:

```powershell
npm run build
npm test
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

## Project structure

```
src/                 React frontend (components, stores, services, types, tests)
src-tauri/           Rust backend (audio import, YouTube/Spotify, media proxy, tray)
src-tauri/sidecars/  Pinned sidecar versions + SHA256 checksums
scripts/             Sidecar downloader
```

## Security & privacy

Miles is local-first: your library and preferences stay on your machine, and resolved stream URLs live only in memory — never on disk or in git. Uploads are size- and type-checked, file deletes are confined to the library folder, and sidecars are checksum-verified at download, build, and runtime.

> [!WARNING]
> Never commit cookies, downloaded media, stream URLs, or credentials to this repository.

See [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## Acknowledgments

Bundled binaries: [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [Deno](https://github.com/denoland/deno) (see `src-tauri/sidecars/` and `src-tauri/licenses/`). Miles is not affiliated with or endorsed by Spotify, YouTube, yt-dlp, Deno, or Google — use it only for content you own or are authorized to access.
