# Miles Music Player — Project Instructions

Desktop music player (Tauri v2 + React) untuk audio lokal, YouTube, dan Spotify.

## Tech Stack
- Frontend: React 18, TypeScript (strict), Vite, Tailwind CSS 3, Zustand 4
- Desktop shell: Tauri 2.x (Rust, edition 2021, rust-version 1.77.2)
- Sidecar (bundled, verifikasi SHA256): yt-dlp + Deno untuk resolusi YouTube/Spotify
- Lainnya: lofty (metadata audio), image (normalisasi cover), tiny_http (media proxy), discord-rich-presence

## Code Style
- TS/TSX: kebab-case untuk file (`audioService.ts`, `usePlayerStore.ts`), PascalCase untuk komponen React
- Rust: snake_case file & fungsi; error via tipe `YoutubeError { code, message, retryable }` dengan kode enum
- UI string user-facing dalam Bahasa Indonesia
- Jangan tambah komentar tanpa perlu; ikuti pola error handling yang ada
- Kembalikan error sebagai `Result<T, string>` pada command Tauri sederhana (lib.rs); gunakan `YoutubeErrorCode` pada modul youtube

## Testing
- Frontend: `npm test` (Vitest, jsdom). File test: `src/test/*.test.ts`, `*.test.js`
- Rust: `cargo test` (unit `#[cfg(test)]` inline + integrasi di `src-tauri/tests/`)
- Test live/smoke yang butuh akses internet: tandai `#[ignore]` (lihat `live_public_playlist_and_track_smoke`)

## Build & Run
- Dev web saja: `npm run dev` (port 3000, strictPort)
- Dev app penuh: `npm run tauri dev`
- Sidecar (wajib sekali setelah clone): `node scripts/download-sidecars.mjs`
- Build: `npm run build` maka `npm run tauri -- build` (installer release)
- Lint/verifikasi frontend: `tsc` (via `npm run build`); tidak ada ESLint
- Rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`

## Project Structure
```
src/            Frontend React
  components/   UI (ControlBar, MusicDrawer, VinylWidget, dll)
  services/     Pembungkus invoke() Tauri: audioService, youtubeService, spotifyService,
                discordRpcService, localImportPolicy
  stores/       Zustand: usePlayerStore (state global) + playerPersistence (migrasi persist)
  types/        Tipe TS (player, youtube, spotify)
  test/         Test Vitest
src-tauri/      Backend Rust
  src/          lib.rs (window/tray/audio import), youtube/ (process, scheduler, matching),
                spotify.rs, media_proxy.rs, discord_rpc.rs, sidecar_manifest.rs
  tests/        Test integrasi Rust
  capabilities/ Permissions Tauri (default.json)
  sidecars/     Versi pin + checksum yt-dlp & deno per platform
scripts/        download-sidecars.mjs / .ps1
.github/workflows/  ci.yml (validate) + release.yml
```

## Conventions
- Git: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), cabang `main`, dependabot untuk bump dependensi
- State: pusatkan di `usePlayerStore`; ambil substring via selector + `useShallow`/`shallow`; hindari subscribe ke objek besar
- Async frontend: request-id guard (`activeYoutubeImportRequestId`/`activeSpotifyImportRequestId`) untuk buang hasil stale dari pencarian/import yang dibatalkan
- Error playback: kode auto-skip di `AUTO_SKIP_CODES` (`audioService.ts`); pesan user lewat `libraryNotice`
- File audio lokal: hash SHA-256 untuk dedupe; path file dikuncid `$APPDATA/library/`; cek canonical path sebelum delete (anti path traversal)
- Stream URL YouTube/Spotify tidak boleh dipersist/di-commit — hanya lewat MediaProxy di memori

## Keamanan
- Jangan commit cookies, file audio user, URL stream hasil resolve, atau kredensial ke repo
- Lihat `SECURITY.md` untuk kebijakan dan cara lapor kerentanan