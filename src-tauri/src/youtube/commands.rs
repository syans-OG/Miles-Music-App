use super::dependencies::{verify_runtime_sidecars, VerifiedSidecars};
use super::error::{YoutubeError, YoutubeErrorCode};
use super::matching::{parse_youtube_search_json, select_spotify_candidate};
use super::normalize::{normalize_playlist_json, normalize_track_json};
use super::process::{
    isolated_ytdlp_arguments, CancellationToken, OperationKind, ProcessError, ProcessErrorKind,
    ProcessRequest, ProcessRunner,
};
use super::scheduler::{ResolvePriority, ScheduleError, YoutubeScheduler};
use super::types::{
    ResolvePurpose, ResolvedYoutubeTrack, SpotifyTrackMatchRequest, SpotifyTrackMatchResult,
    YoutubePlaylistImport, YoutubeResource,
};
use super::validation::{parse_youtube_url, validate_video_id};
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

const PLAYLIST_ARGUMENTS: [&str; 7] = [
    "--flat-playlist",
    "--playlist-end",
    "100",
    "--dump-single-json",
    "--skip-download",
    "--no-cache-dir",
    "--no-warnings",
];
const TRACK_ARGUMENTS: [&str; 9] = [
    "--dump-single-json",
    "--no-playlist",
    "--skip-download",
    "--no-cache-dir",
    "--no-warnings",
    "--format",
    "bestaudio[ext=m4a]/bestaudio",
    "--format-sort",
    "ext:m4a",
];
const SPOTIFY_MATCH_ARGUMENTS: [&str; 7] = [
    "--flat-playlist",
    "--playlist-end",
    "5",
    "--dump-single-json",
    "--skip-download",
    "--no-cache-dir",
    "--no-warnings",
];
const MAX_SPOTIFY_MATCH_TEXT_CHARS: usize = 160;
const MAX_SPOTIFY_MATCH_DURATION_SECONDS: u64 = 24 * 60 * 60;

#[derive(Clone, Default)]
pub struct YoutubeCommandService {
    runner: ProcessRunner,
    scheduler: YoutubeScheduler,
    spotify_match_sequence: Arc<AtomicU64>,
    active_spotify_match: Arc<Mutex<Option<(u64, CancellationToken)>>>,
}

#[derive(Clone)]
pub struct YoutubeExecutables {
    pub yt_dlp: PathBuf,
    pub deno: PathBuf,
    pub prefix_arguments: Vec<OsString>,
}

impl YoutubeExecutables {
    fn verified() -> Result<Self, YoutubeError> {
        let sidecars = verify_runtime_sidecars()
            .map_err(|_| YoutubeError::new(YoutubeErrorCode::DependencyUnavailable))?;
        Ok(Self::from(sidecars))
    }
}

impl From<&VerifiedSidecars> for YoutubeExecutables {
    fn from(sidecars: &VerifiedSidecars) -> Self {
        Self {
            yt_dlp: sidecars.yt_dlp.clone(),
            deno: sidecars.deno.clone(),
            prefix_arguments: Vec::new(),
        }
    }
}

impl YoutubeCommandService {
    pub fn import_playlist(&self, url: String) -> Result<YoutubePlaylistImport, YoutubeError> {
        self.import_playlist_with(url, YoutubeExecutables::verified()?)
    }

    pub fn resolve_track(
        &self,
        video_id: String,
        purpose: ResolvePurpose,
    ) -> Result<ResolvedYoutubeTrack, YoutubeError> {
        self.resolve_track_with(video_id, purpose.into(), YoutubeExecutables::verified()?)
    }

    pub fn cancel_import(&self) {
        self.scheduler.cancel_import();
    }

    pub fn cancel_resolve(&self) {
        self.scheduler.cancel_resolve();
    }

    pub fn cancel_spotify_match(&self) {
        if let Some((_, cancellation)) = self
            .active_spotify_match
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .as_ref()
        {
            cancellation.cancel();
        }
    }

    pub fn import_playlist_with(
        &self,
        url: String,
        executables: YoutubeExecutables,
    ) -> Result<YoutubePlaylistImport, YoutubeError> {
        let (playlist_id, canonical_url) = validated_playlist(&url)?;
        let cancellation = CancellationToken::default();
        let permit = self
            .scheduler
            .acquire_import(cancellation.clone())
            .map_err(schedule_error)?;
        let output = self.run_operation(
            OperationKind::Import,
            &cancellation,
            &executables,
            &PLAYLIST_ARGUMENTS,
            &canonical_url,
        )?;
        let playlist = normalize_playlist_json(as_utf8(&output.stdout)?, &playlist_id)?;
        if !permit.is_current() {
            return Err(YoutubeError::new(YoutubeErrorCode::Cancelled));
        }
        Ok(playlist)
    }

    pub fn resolve_track_with(
        &self,
        video_id: String,
        priority: ResolvePriority,
        executables: YoutubeExecutables,
    ) -> Result<ResolvedYoutubeTrack, YoutubeError> {
        validate_video_id(&video_id)?;
        let is_search = video_id.starts_with("ytsearch1:");
        let target_url = if is_search {
            video_id.clone()
        } else {
            format!("https://www.youtube.com/watch?v={video_id}")
        };
        let cancellation = CancellationToken::default();
        let permit = self
            .scheduler
            .acquire_resolve(priority, cancellation.clone())
            .map_err(schedule_error)?;
        let output = self.run_operation(
            OperationKind::Resolve,
            &cancellation,
            &executables,
            &TRACK_ARGUMENTS,
            &target_url,
        )?;
        let track = normalize_track_json(as_utf8(&output.stdout)?)?;
        if !is_search && track.video_id != video_id {
            return Err(YoutubeError::new(YoutubeErrorCode::InvalidMetadata));
        }
        if !permit.is_current() {
            return Err(YoutubeError::new(YoutubeErrorCode::Cancelled));
        }
        Ok(track)
    }

    pub fn match_spotify_track(
        &self,
        request: SpotifyTrackMatchRequest,
    ) -> Result<SpotifyTrackMatchResult, YoutubeError> {
        self.match_spotify_track_with(request, YoutubeExecutables::verified()?)
    }

    pub fn match_spotify_track_with(
        &self,
        request: SpotifyTrackMatchRequest,
        executables: YoutubeExecutables,
    ) -> Result<SpotifyTrackMatchResult, YoutubeError> {
        let search_target = validated_spotify_search_target(&request)?;
        let cancellation = CancellationToken::default();
        let match_id = self.spotify_match_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        {
            let mut active = self
                .active_spotify_match
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if let Some((_, previous)) = active.replace((match_id, cancellation.clone())) {
                previous.cancel();
            }
        }

        let result = (|| {
            let permit = self
                .scheduler
                .acquire_resolve(ResolvePriority::Prefetch, cancellation.clone())
                .map_err(schedule_error)?;
            let output = self.run_operation(
                OperationKind::Resolve,
                &cancellation,
                &executables,
                &SPOTIFY_MATCH_ARGUMENTS,
                &search_target,
            )?;
            let candidates = parse_youtube_search_json(as_utf8(&output.stdout)?)?;
            if !permit.is_current() {
                return Err(YoutubeError::new(YoutubeErrorCode::Cancelled));
            }
            Ok(select_spotify_candidate(&request, &candidates))
        })();

        let mut active = self
            .active_spotify_match
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active.as_ref().map(|(active_id, _)| *active_id) == Some(match_id) {
            active.take();
        }
        result
    }

    fn run_operation(
        &self,
        operation: OperationKind,
        cancellation: &CancellationToken,
        executables: &YoutubeExecutables,
        operation_arguments: &[&str],
        canonical_url: &str,
    ) -> Result<super::process::ProcessOutput, YoutubeError> {
        let create_request = || {
            let mut arguments = executables.prefix_arguments.clone();
            arguments.extend(isolated_ytdlp_arguments(
                &executables.deno,
                operation_arguments,
                canonical_url,
            ));
            ProcessRequest {
                program: executables.yt_dlp.clone(),
                arguments,
                operation,
            }
        };
        self.runner
            .run_with_retry_if(
                operation,
                cancellation,
                create_request,
                is_retryable_ytdlp_error,
            )
            .map_err(classify_process_error)
    }
}

#[tauri::command]
pub async fn import_youtube_playlist(
    service: tauri::State<'_, YoutubeCommandService>,
    url: String,
) -> Result<YoutubePlaylistImport, YoutubeError> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.import_playlist(url))
        .await
        .unwrap_or_else(|_| Err(YoutubeError::new(YoutubeErrorCode::ProcessFailed)))
}

#[tauri::command]
pub async fn resolve_youtube_track(
    service: tauri::State<'_, YoutubeCommandService>,
    video_id: String,
    purpose: Option<ResolvePurpose>,
) -> Result<ResolvedYoutubeTrack, YoutubeError> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.resolve_track(video_id, purpose.unwrap_or_default())
    })
    .await
    .unwrap_or_else(|_| Err(YoutubeError::new(YoutubeErrorCode::ProcessFailed)))
}

#[tauri::command]
pub fn cancel_youtube_import(service: tauri::State<'_, YoutubeCommandService>) {
    service.cancel_import();
}

#[tauri::command]
pub fn cancel_youtube_resolve(service: tauri::State<'_, YoutubeCommandService>) {
    service.cancel_resolve();
}

#[tauri::command]
pub async fn match_spotify_track(
    service: tauri::State<'_, YoutubeCommandService>,
    request: SpotifyTrackMatchRequest,
) -> Result<SpotifyTrackMatchResult, YoutubeError> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.match_spotify_track(request))
        .await
        .unwrap_or_else(|_| Err(YoutubeError::new(YoutubeErrorCode::ProcessFailed)))
}

#[tauri::command]
pub fn cancel_spotify_match(service: tauri::State<'_, YoutubeCommandService>) {
    service.cancel_spotify_match();
}

impl From<ResolvePurpose> for ResolvePriority {
    fn from(purpose: ResolvePurpose) -> Self {
        match purpose {
            ResolvePurpose::ExplicitSelection => Self::ExplicitSelection,
            ResolvePurpose::SequentialNext => Self::SequentialNext,
            ResolvePurpose::Prefetch => Self::Prefetch,
        }
    }
}

fn validated_playlist(url: &str) -> Result<(String, String), YoutubeError> {
    match parse_youtube_url(url)? {
        YoutubeResource::Playlist {
            playlist_id,
            canonical_url,
        } => Ok((playlist_id, canonical_url)),
        YoutubeResource::Video { .. } => Err(YoutubeError::new(YoutubeErrorCode::UnsupportedUrl)),
    }
}

fn validated_spotify_search_target(
    request: &SpotifyTrackMatchRequest,
) -> Result<String, YoutubeError> {
    let has_valid_id = request.spotify_id.len() == 22
        && request
            .spotify_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric());
    let valid_text = |value: &str| {
        let trimmed = value.trim();
        !trimmed.is_empty()
            && trimmed.chars().count() <= MAX_SPOTIFY_MATCH_TEXT_CHARS
            && trimmed
                .chars()
                .all(|character| !character.is_control() || character.is_whitespace())
    };
    if !has_valid_id
        || !valid_text(&request.title)
        || !valid_text(&request.artist)
        || request.duration_seconds == 0
        || request.duration_seconds > MAX_SPOTIFY_MATCH_DURATION_SECONDS
    {
        return Err(YoutubeError::new(YoutubeErrorCode::InvalidMetadata));
    }
    Ok(format!(
        "ytsearch5:{} {}",
        request.artist.trim(),
        request.title.trim()
    ))
}

fn as_utf8(output: &[u8]) -> Result<&str, YoutubeError> {
    std::str::from_utf8(output).map_err(|_| YoutubeError::new(YoutubeErrorCode::InvalidMetadata))
}

fn schedule_error(_: ScheduleError) -> YoutubeError {
    YoutubeError::new(YoutubeErrorCode::Cancelled)
}

fn is_retryable_ytdlp_error(error: &ProcessError) -> bool {
    if error.kind == ProcessErrorKind::Timeout {
        return true;
    }
    error.kind == ProcessErrorKind::ProcessFailed
        && (error.exit_code == Some(75)
            || [
                "temporar",
                "timed out",
                "connection",
                "network",
                "http error 429",
                "http error 5",
            ]
            .iter()
            .any(|pattern| error.diagnostic_contains(pattern)))
}

fn classify_process_error(error: ProcessError) -> YoutubeError {
    let code = if error.diagnostic_contains("private video")
        || error.diagnostic_contains("members-only")
    {
        YoutubeErrorCode::PrivateVideo
    } else if error.diagnostic_contains("age-restricted")
        || error.diagnostic_contains("confirm your age")
    {
        YoutubeErrorCode::AgeRestricted
    } else if error.diagnostic_contains("unavailable")
        || error.diagnostic_contains("has been removed")
    {
        YoutubeErrorCode::Unavailable
    } else {
        return error.into();
    };
    YoutubeError::new(code)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_arguments_never_request_media_downloads() {
        assert!(PLAYLIST_ARGUMENTS.contains(&"--skip-download"));
        assert!(TRACK_ARGUMENTS.contains(&"--skip-download"));
        assert!(TRACK_ARGUMENTS.contains(&"bestaudio[ext=m4a]/bestaudio"));
        assert!(!PLAYLIST_ARGUMENTS
            .iter()
            .any(|value| value.contains("cookies")));
        assert!(!TRACK_ARGUMENTS
            .iter()
            .any(|value| value.contains("cookies")));
        assert!(SPOTIFY_MATCH_ARGUMENTS.contains(&"--skip-download"));
        assert!(!SPOTIFY_MATCH_ARGUMENTS
            .iter()
            .any(|value| value.contains("cookies")));
    }

    #[test]
    fn spotify_search_target_rejects_untrusted_metadata() {
        let valid = SpotifyTrackMatchRequest {
            spotify_id: "4xF4ZBGPZKxECeDFrqSAG4".to_string(),
            title: "Sunflower".to_string(),
            artist: "Post Malone Swae Lee".to_string(),
            duration_seconds: 158,
        };
        assert_eq!(
            validated_spotify_search_target(&valid).expect("valid request"),
            "ytsearch5:Post Malone Swae Lee Sunflower"
        );

        for invalid in [
            SpotifyTrackMatchRequest {
                spotify_id: "bad".to_string(),
                ..valid.clone()
            },
            SpotifyTrackMatchRequest {
                title: "\0".to_string(),
                ..valid.clone()
            },
            SpotifyTrackMatchRequest {
                duration_seconds: 0,
                ..valid.clone()
            },
        ] {
            assert!(validated_spotify_search_target(&invalid).is_err());
        }
    }

    #[test]
    #[ignore = "requires live YouTube access; run only during release smoke validation"]
    fn live_public_playlist_and_track_smoke() {
        let playlist_url = std::env::var("MILES_SMOKE_PLAYLIST_URL")
            .expect("MILES_SMOKE_PLAYLIST_URL must contain a public playlist URL");
        let video_url = std::env::var("MILES_SMOKE_VIDEO_URL")
            .expect("MILES_SMOKE_VIDEO_URL must contain a public video URL");
        let video_id = match parse_youtube_url(&video_url).expect("video URL must be valid") {
            YoutubeResource::Video { video_id, .. } => video_id,
            YoutubeResource::Playlist { .. } => panic!("video smoke URL must not be a playlist"),
        };
        let service = YoutubeCommandService::default();

        let playlist = service
            .import_playlist(playlist_url)
            .expect("public playlist import must succeed");
        assert!(!playlist.title.trim().is_empty());
        assert!(playlist.entries.len() <= 100);
        assert!(playlist.total_candidates >= playlist.entries.len());

        let track = service
            .resolve_track(video_id.clone(), ResolvePurpose::ExplicitSelection)
            .expect("public video resolve must succeed");
        assert_eq!(track.video_id, video_id);
        assert!(track.duration_seconds > 0);
        assert_eq!(track.live_status, super::super::types::LiveStatus::NotLive);
        assert!(track.stream.url.starts_with("https://"));
        assert!(!track.stream.audio_codec.trim().is_empty());

        println!(
            "live smoke passed: playlist_entries={}, skipped={}, track_duration_seconds={}",
            playlist.entries.len(),
            playlist.skipped.len(),
            track.duration_seconds
        );
    }
}
