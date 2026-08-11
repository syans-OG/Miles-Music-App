# Hidden Windows Process Cleanup

## Understanding summary

- Miles briefly shows a console window only when a YouTube resolver process is
  cancelled, times out, exceeds its output limit, or fails during cleanup.
- The visible process is `taskkill.exe`, not the main `yt-dlp` sidecar.
- The primary sidecar already uses Windows `CREATE_NO_WINDOW`; the cleanup path
  does not.
- Cleanup must continue terminating the complete yt-dlp/Deno process tree.
- Playback, retry, timeout, scheduling, and error behavior must not change.

## Assumptions

- Windows remains the primary runtime.
- A headless automated test cannot reliably observe whether Windows displayed a
  console, so regression coverage will protect the shared command-construction
  path and existing process-tree termination behavior.
- Other operating systems retain their current process behavior.

## Approaches considered

1. **Shared `CREATE_NO_WINDOW` command builder (selected).** Use one helper for
   both yt-dlp and `taskkill.exe`. This is the smallest change and prevents the
   two paths from drifting again.
2. Configure `STARTUPINFO` with `SW_HIDE`. This requires lower-level Windows API
   plumbing without improving behavior for this use case.
3. Replace `taskkill /T /F` with `Child::kill`. Rejected because it can leave the
   Deno child process running.

## Decision log

- Keep `taskkill.exe /PID <pid> /T /F` unchanged.
- Centralize Windows console suppression in one helper.
- Preserve redirected/null standard streams.
- Validate formatting, Clippy with warnings denied, unit/integration tests, and
  the frontend build after the patch.
