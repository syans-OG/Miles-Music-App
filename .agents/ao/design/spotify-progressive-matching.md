# Spotify Progressive YouTube Matching

## Understanding summary

- Spotify playlist, album, or track metadata is fetched first and shown as a
  visible draft immediately.
- Tracks are verified sequentially in the background against multiple YouTube
  candidates.
- Only tracks with a sufficiently strong title, artist, and duration match enter
  the library, playlist, and persisted storage.
- The first valid track starts playback while remaining tracks continue matching.
- Unavailable, live, private, or weak matches are skipped and included in the
  final report.
- A draft with no valid tracks is removed and reported as a failed import.
- Direct audio stream URLs remain volatile and are never persisted.

## Assumptions and non-functional requirements

- Imports are capped at 100 Spotify tracks.
- At most one Spotify matcher is active, using background resolver priority.
- Playback resolution always takes priority over matching.
- Process timeout remains 15 seconds with one retry where the existing process
  policy allows it.
- Matching can be cancelled without affecting current playback.
- No Spotify or Google API key, account, browser cookie, or login is introduced.
- A completed match persists the Spotify ID and validated YouTube video ID, not a
  direct stream URL.
- A partial playlist is a valid result; an interrupted job is not resumed after
  application restart.

## Approaches considered

### Frontend orchestrator with Rust matcher — selected

The frontend owns progress and commits one verified result at a time. Rust owns
candidate retrieval, validation, and deterministic scoring. This fits the
existing Zustand flow, keeps IPC payloads bounded, and avoids a new event-driven
job subsystem.

### Single Rust background job with progress events

Centralized cancellation is attractive, but it requires a job registry, event
lifecycle, stale-event guards, and more synchronization than this version needs.

### Rust candidate retrieval with TypeScript scoring

Rejected because it increases IPC data, duplicates trust boundaries, and makes
matching behavior easier to diverge across frontend and backend.

## Final design

### Import flow

1. Fetch Spotify metadata without committing tracks.
2. Create a volatile draft playlist and a dedicated Spotify import task.
3. Invoke `match_spotify_track` sequentially for up to 100 tracks.
4. Commit each successful match immediately; start playback on the first match.
5. Skip rejected candidates without persisting the track.
6. Finalize the draft after the first valid match, or remove it if all tracks fail.
7. Present a final success, partial, cancelled, or error report.

Direct audio remains lazily resolved during playback through
`ytsearch1:<artist + title>`, the path proven stable in the WebView runtime.
The selected YouTube video ID and canonical URL are retained as validation
evidence, not used as the playback resolver key.

### Candidate scoring

- Retrieve at most five metadata candidates.
- Reject live/upcoming, unavailable/private, malformed IDs or durations, and
  duration differences greater than 30 seconds or 20 percent.
- Score title similarity up to 45 points, artist similarity up to 30, duration
  similarity up to 20, and source confidence up to 5.
- Penalize karaoke, cover, nightcore, sped-up, slowed, instrumental, remix, and
  live qualifiers unless the qualifier is present in the Spotify title.
- Accept only scores of 70 or higher; choose the highest score deterministically.

### Scheduling and cancellation

Spotify matching uses background priority. Explicit playback may preempt it; the
orchestrator retries the same track after playback becomes ready. A Spotify-only
cancellation token stops matching without cancelling the active audio resolver.
Already committed matches remain, pending tracks do not.

### Persistence

`SpotifySongSource` gains a validated `matchedVideoId` and `canonicalUrl`.
Storage version 5 preserves local, YouTube, and valid Spotify songs while removing
malformed Spotify legacy entries. Direct streams remain in the runtime cache.
Spotify covers remain intact during import and restore; a real YouTube thumbnail
may replace one only after full playback resolution succeeds.

### UI states

The task moves through `fetching`, `matching`, and a terminal `completed`,
`partial`, `cancelled`, or `error` state. Progress shows the checked and total
track counts. The final report lists skipped titles and reasons.

### Testing

- Rust scoring fixtures for official audio, music video, remix, karaoke, cover,
  different artists, duration boundaries, and live/unavailable candidates.
- Scheduler and cancellation tests proving playback priority and process cleanup.
- Zustand tests for progressive commit, deduplication, partial results, empty
  cleanup, and first-valid autoplay.
- Persistence fixtures for version 3 to 5 migration and stream URL exclusion.
- Full TypeScript, frontend tests/build, Rust fmt, Clippy, Rust tests, and audit.

## Decision log

- **Progressive import:** selected over blocking and lazy-only verification to
  balance correctness with responsive UI.
- **Skip weak matches:** selected over best-effort playback or manual selection to
  avoid playing the wrong recording.
- **Frontend orchestration:** selected over a Rust event job for lower complexity.
- **Rust scoring:** selected as the single trust and matching boundary.
- **Threshold 70:** selected to prioritize precision; constants remain testable.
- **Persist matched video ID:** retained as import-validation evidence; playback
  uses the stable search resolver because direct-ID playback regressed in WebView2.
- **Playback priority:** selected so background imports never interrupt listening.
- **Storage v5 migration:** required to preserve valid Spotify items during future
  application upgrades.
