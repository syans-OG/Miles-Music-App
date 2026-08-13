# Spotify Playlist Placeholder and Playback Cover Upgrade

## Understanding summary

- Songs imported from a Spotify playlist initially display that playlist's artwork as a consistent placeholder.
- When a song is played successfully, its cover changes to the resolved YouTube thumbnail.
- The upgraded YouTube cover is persisted across the library, playlists, playback queue, and restarts.
- Playlist artwork itself remains unchanged.
- Import matching, playback, persistence, and cancellation behavior remain unchanged.

## Assumptions

- Spotify playlist metadata normally contains playlist artwork; the built-in cover remains the final import fallback.
- A cached successful YouTube resolution retains the exact thumbnail returned with that resolved stream.
- Existing imported records are not rewritten; a fresh import is used to validate this policy.

## Approaches considered

1. **Playlist placeholder upgraded on playback (selected):** fast and visually complete at import, while played songs gradually gain their matched YouTube identity.
2. YouTube artwork during import: gives distinct covers immediately, but exposes inconsistent search-result artwork before playback.
3. Spotify oEmbed per track: aims for official album art, but produced repeated or unreliable results in live testing and adds a request per song.

## Decision log

- Remove Spotify oEmbed lookup from the per-track matching path.
- Use playlist artwork as the initial song/CD placeholder.
- Upgrade only after a successful playback resolution or a previously successful cached resolution.
- Keep the playlist entity's cover unchanged.
- Add regression coverage for both initial placeholder and playback-time persisted upgrade.

## Final design

`matchedSpotifySong` selects the Spotify resource cover, then track cover, then the built-in fallback; it deliberately ignores the search-result YouTube thumbnail. The Rust matching command no longer performs a per-track Spotify oEmbed request. When `AudioService` obtains a successful resolved track, it updates the Spotify song with that track's thumbnail before playback. The runtime cache stores that exact thumbnail beside the stream, so repeated or prefetched playback cannot accidentally reconstruct a cover from a different, earlier candidate video ID. The existing metadata updater propagates and persists this change without modifying the playlist entity's own cover.
