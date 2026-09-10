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
    DownloadedTrack, ResolvePurpose, ResolvedYoutubeTrack, SpotifyMatchPriority,
    SpotifyTrackMatchRequest, SpotifyTrackMatchResult, YoutubePlaylistImport, YoutubeResource,
};
use super::validation::{parse_youtube_url, validate_video_id};
use crate::media_proxy::MediaProxy;
use sha2::Digest;
use std::collections::HashMap;
use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

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
    active_spotify_matches: Arc<Mutex<HashMap<u64, CancellationToken>>>,
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
        self.scheduler.cancel_spotify_match();
        let active = self
            .active_spotify_matches
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        for cancellation in active.values() {
            cancellation.cancel();
        }
    }

    pub fn download_track_with(
        &self,
        video_id: String,
        executables: YoutubeExecutables,
        library_dir: PathBuf,
    ) -> Result<DownloadedTrack, YoutubeError> {
        validate_video_id(&video_id)?;
        let target_url = format!("https://www.youtube.com/watch?v={video_id}");
        let cancellation = CancellationToken::default();
        let _permit = self
            .scheduler
            .acquire_download(cancellation.clone())
            .map_err(schedule_error)?;

        let temp_dir = std::env::temp_dir().join(format!("miles-dl-{video_id}"));
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir)
            .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?;

        let output_template = temp_dir.join("audio.%(ext)s");
        let output_str = output_template.to_string_lossy();
        let operation_args = [
            "--no-playlist",
            "--no-cache-dir",
            "--no-warnings",
            "--format",
            "ba[ext=m4a]/ba",
            "--write-thumbnail",
            "--output",
            &output_str,
        ];

        let runner = ProcessRunner::with_limits(Duration::from_secs(300), 256 * 1024);
        let create_request = || {
            let mut arguments = executables.prefix_arguments.clone();
            arguments.extend(isolated_ytdlp_arguments(
                &executables.deno,
                &operation_args,
                &target_url,
            ));
            ProcessRequest {
                program: executables.yt_dlp.clone(),
                arguments,
                operation: OperationKind::Download,
            }
        };
        runner
            .run_with_retry_if(
                OperationKind::Download,
                &cancellation,
                create_request,
                is_retryable_ytdlp_error,
            )
            .map_err(classify_process_error)?;

        if cancellation.is_cancelled() {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(YoutubeError::new(YoutubeErrorCode::Cancelled));
        }

        let entries: Vec<_> = std::fs::read_dir(&temp_dir)
            .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?
            .filter_map(|entry| entry.ok())
            .collect();

        let audio_exts = ["m4a", "mp4", "webm", "opus", "ogg", "mp3"];
        let image_exts = ["jpg", "jpeg", "png", "webp"];

        let audio_entry = entries.iter().find(|entry| {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            audio_exts
                .iter()
                .any(|ext| name.starts_with("audio.") && name.ends_with(ext))
        });

        let image_entry = entries.iter().find(|entry| {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            image_exts.iter().any(|ext| name.ends_with(ext))
        });

        let audio_entry = audio_entry.ok_or_else(|| {
            let _ = std::fs::remove_dir_all(&temp_dir);
            YoutubeError::new(YoutubeErrorCode::AudioStreamUnavailable)
        })?;

        let audio_len = std::fs::metadata(audio_entry.path())
            .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?
            .len();
        if audio_len > crate::MAX_LOCAL_AUDIO_FILE_BYTES as u64 {
            let _ = std::fs::remove_dir_all(&temp_dir);
            return Err(YoutubeError::with_detail(
                YoutubeErrorCode::ProcessFailed,
                "Audio file exceeds the 128 MB limit",
            ));
        }

        let file_hash = {
            let mut audio_source = std::fs::File::open(audio_entry.path())
                .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?;
            let mut hasher = sha2::Sha256::new();
            let mut buffer = [0u8; 64 * 1024];
            loop {
                let bytes_read = std::io::Read::read(&mut audio_source, &mut buffer)
                    .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?;
                if bytes_read == 0 {
                    break;
                }
                hasher.update(&buffer[..bytes_read]);
            }
            format!("{:x}", hasher.finalize())
        };
        let extension = audio_entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("m4a")
            .to_string();

        std::fs::create_dir_all(&library_dir)
            .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?;

        let audio_destination = library_dir.join(format!("{file_hash}.{extension}"));
        if !audio_destination.exists() {
            std::fs::copy(audio_entry.path(), &audio_destination)
                .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?;
        }

        let mut cover_path: Option<String> = None;
        if let Some(img_entry) = image_entry {
            if let Ok(img_bytes) = std::fs::read(img_entry.path()) {
                let covers_dir = library_dir.join("covers");
                let _ = std::fs::create_dir_all(&covers_dir);
                let cover_destination = covers_dir.join(format!("{file_hash}.png"));
                if let Some(normalized) = crate::normalize_embedded_cover(&img_bytes) {
                    let _ = std::fs::write(&cover_destination, normalized);
                    cover_path = Some(cover_destination.to_string_lossy().into_owned());
                }
            }
        }

        let _ = std::fs::remove_dir_all(&temp_dir);

        Ok(DownloadedTrack {
            video_id,
            file_path: audio_destination.to_string_lossy().into_owned(),
            file_hash,
            cover_path,
            duration_seconds: 0,
        })
    }

    pub fn cancel_download(&self) {
        self.scheduler.cancel_download();
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
        self.match_spotify_track_with_priority(
            request,
            SpotifyMatchPriority::Import,
            YoutubeExecutables::verified()?,
        )
    }

    pub fn match_spotify_track_with(
        &self,
        request: SpotifyTrackMatchRequest,
        executables: YoutubeExecutables,
    ) -> Result<SpotifyTrackMatchResult, YoutubeError> {
        self.match_spotify_track_with_priority(request, SpotifyMatchPriority::Import, executables)
    }

    pub fn match_spotify_track_with_priority(
        &self,
        request: SpotifyTrackMatchRequest,
        priority: SpotifyMatchPriority,
        executables: YoutubeExecutables,
    ) -> Result<SpotifyTrackMatchResult, YoutubeError> {
        let search_target = validated_spotify_search_target(&request)?;
        let cancellation = CancellationToken::default();
        let match_id = self.spotify_match_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        {
            let mut active = self
                .active_spotify_matches
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            active.insert(match_id, cancellation.clone());
        }

        let result = (|| {
            let permit = self
                .scheduler
                .acquire_spotify_match(priority, cancellation.clone())
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
            .active_spotify_matches
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        active.remove(&match_id);
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
    media_proxy: tauri::State<'_, MediaProxy>,
    video_id: String,
    purpose: Option<ResolvePurpose>,
) -> Result<ResolvedYoutubeTrack, YoutubeError> {
    let service = service.inner().clone();
    let media_proxy = media_proxy.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut track = service.resolve_track(video_id, purpose.unwrap_or_default())?;
        track.stream.url = media_proxy
            .register(&track.stream.url, track.stream.expires_at_unix)
            .map_err(|_| YoutubeError::retryable(YoutubeErrorCode::AudioStreamUnavailable))?;
        Ok(track)
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
    priority: Option<SpotifyMatchPriority>,
) -> Result<SpotifyTrackMatchResult, YoutubeError> {
    let service = service.inner().clone();
    let priority = priority.unwrap_or(SpotifyMatchPriority::Import);
    tauri::async_runtime::spawn_blocking(move || {
        service.match_spotify_track_with_priority(
            request,
            priority,
            YoutubeExecutables::verified()?,
        )
    })
    .await
    .unwrap_or_else(|_| Err(YoutubeError::new(YoutubeErrorCode::ProcessFailed)))
}

#[tauri::command]
pub fn cancel_spotify_match(service: tauri::State<'_, YoutubeCommandService>) {
    service.cancel_spotify_match();
}

#[tauri::command]
pub async fn download_youtube_track(
    app_handle: tauri::AppHandle,
    service: tauri::State<'_, YoutubeCommandService>,
    video_id: String,
) -> Result<DownloadedTrack, YoutubeError> {
    let service = service.inner().clone();
    let library_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|_| YoutubeError::new(YoutubeErrorCode::ProcessFailed))?
        .join("library");
    tauri::async_runtime::spawn_blocking(move || {
        service.download_track_with(video_id, YoutubeExecutables::verified()?, library_dir)
    })
    .await
    .unwrap_or_else(|_| Err(YoutubeError::new(YoutubeErrorCode::ProcessFailed)))
}

#[tauri::command]
pub fn cancel_youtube_download(service: tauri::State<'_, YoutubeCommandService>) {
    service.cancel_download();
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
    let clean_id = request
        .spotify_id
        .strip_prefix("spotify-")
        .unwrap_or(&request.spotify_id);
    let clean_id = clean_id.strip_prefix("spotify:track:").unwrap_or(clean_id);
    let has_valid_id = clean_id.is_empty()
        || (clean_id.len() == 22 && clean_id.bytes().all(|byte| byte.is_ascii_alphanumeric()));
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
