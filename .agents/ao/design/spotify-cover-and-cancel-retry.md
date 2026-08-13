# Spotify Cover and Cancel/Retry Consistency

## Understanding summary

- Spotify imports must keep Spotify artwork for both individual tracks and the generated playlist.
- Playlist artwork must remain the playlist artwork; it must not be replaced by the first imported track.
- A track without artwork in Spotify playlist metadata should obtain its artwork from Spotify's public oEmbed endpoint.
- YouTube matching remains the audio-source resolver and its thumbnail is only a final visual fallback.
- Cancelling an import must invalidate every in-flight result immediately.
- Retrying the same import must never append a second copy of a song already committed by the cancelled run.
- Existing progressive import, first-track autoplay, skip reporting, and the 100-track limit remain unchanged.

## Assumptions and constraints

- The app is a personal desktop Tauri application and uses no Spotify API key, login, or cookies.
- Per-track oEmbed lookup is best-effort, bounded by a short timeout, and failure must not fail the track import.
- YouTube matching and Spotify artwork lookup run concurrently so artwork lookup normally adds no matching latency.
- Persisted stream URLs remain forbidden; this change only persists public cover URLs and existing metadata.
- The renderer CSP will allow only Spotify's required official image CDN hosts, not arbitrary remote images.

## Approaches considered

1. **Concurrent Spotify oEmbed plus atomic store commit (selected).** Fetch each track's official artwork while yt-dlp performs matching, then re-check cancellation and duplicate identity at the final Zustand commit. This fixes both root causes without changing the import architecture.
2. Fetch every Spotify cover before matching. Simpler ordering, but serializes network work and delays first playback.
3. Keep YouTube thumbnails for tracks. Lowest implementation cost, but does not meet the requested Spotify artwork behavior.

## Decision log

- Use Spotify oEmbed because the playlist page's embedded track data does not reliably contain per-track artwork.
- Start oEmbed concurrently with the blocking YouTube match and treat it as optional.
- Prefer artwork in this order: per-match Spotify oEmbed, per-track Spotify metadata, resource artwork, YouTube thumbnail, local fallback.
- Preserve the playlist resource cover independently from song covers.
- Guard immediately after asynchronous match boundaries so cancelled requests cannot mutate reports or state.
- Perform duplicate detection inside the Zustand state updater, where the queue state is current, instead of relying on a pre-await snapshot.
- Add regression tests for Spotify cover precedence, playlist cover preservation, playback cover stability, and overlapping cancel/retry imports.

## Final design

The Rust command starts the existing yt-dlp Spotify-to-YouTube matcher and a bounded Spotify oEmbed artwork request at the same time. A matched response gains an optional `spotifyCoverUrl`. Invalid IDs, failed requests, oversized responses, or untrusted artwork URLs simply yield no Spotify artwork and do not fail audio matching.

The frontend constructs a Spotify song using the artwork precedence above. Later YouTube stream resolution must not overwrite an existing Spotify cover. A Spotify-created playlist keeps `data.cover_url`, including on retry, and track commits only update its song collection.

For cancellation safety, the import loop checks its request token immediately after every awaited match or retry path and before any state mutation. The final commit computes whether the song already exists from the current Zustand queue inside `set`, and only then appends it. The playlist and playback queues retain their existing ID-based guards. This makes a stale cancelled result harmless and makes a concurrent retry idempotent.
