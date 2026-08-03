use miles_music_player_lib::youtube::commands::{YoutubeCommandService, YoutubeExecutables};
use miles_music_player_lib::youtube::error::YoutubeErrorCode;
use miles_music_player_lib::youtube::scheduler::ResolvePriority;
use std::ffi::OsString;
use std::path::PathBuf;

const PLAYLIST_ID: &str = "PLDuK_0-3anUREPpS5-EDohLzh29Zpwlv1";

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("fake-sidecar.mjs")
}

fn fixture_executables(scenario: &str) -> YoutubeExecutables {
    YoutubeExecutables {
        yt_dlp: PathBuf::from("node"),
        deno: PathBuf::from("fixture-deno.exe"),
        prefix_arguments: vec![fixture_script().into_os_string(), OsString::from(scenario)],
    }
}

#[test]
fn playlist_command_returns_normalized_partial_result() {
    let playlist = YoutubeCommandService::default()
        .import_playlist_with(
            format!("https://youtube.com/playlist?list={PLAYLIST_ID}&si=fixture"),
            fixture_executables("playlist-success"),
        )
        .expect("playlist command should normalize fixture");

    assert_eq!(playlist.playlist_id, PLAYLIST_ID);
    assert_eq!(playlist.entries.len(), 1);
    assert_eq!(playlist.skipped.len(), 1);
    assert_eq!(
        playlist.skipped[0].reason,
        YoutubeErrorCode::LiveUnsupported
    );
}

#[test]
fn resolve_command_returns_volatile_stream_contract() {
    let track = YoutubeCommandService::default()
        .resolve_track_with(
            "dQw4w9WgXcQ".to_string(),
            ResolvePriority::ExplicitSelection,
            fixture_executables("track-success"),
        )
        .expect("resolve command should normalize fixture");

    assert_eq!(track.video_id, "dQw4w9WgXcQ");
    assert_eq!(track.stream.extension, "m4a");
    assert!(track.stream.url.contains("googlevideo.com"));
}

#[test]
fn resolve_command_maps_private_video_without_leaking_stderr() {
    let error = YoutubeCommandService::default()
        .resolve_track_with(
            "dQw4w9WgXcQ".to_string(),
            ResolvePriority::ExplicitSelection,
            fixture_executables("private-error"),
        )
        .expect_err("private fixture should fail");

    assert_eq!(error.code, YoutubeErrorCode::PrivateVideo);
    assert!(!error.retryable);
    assert!(error.detail.is_none());
}

#[test]
fn resolve_command_maps_age_and_unavailable_errors() {
    let service = YoutubeCommandService::default();
    let age_error = service
        .resolve_track_with(
            "dQw4w9WgXcQ".to_string(),
            ResolvePriority::ExplicitSelection,
            fixture_executables("age-error"),
        )
        .expect_err("age-restricted fixture should fail");
    let unavailable_error = service
        .resolve_track_with(
            "dQw4w9WgXcQ".to_string(),
            ResolvePriority::ExplicitSelection,
            fixture_executables("unavailable-error"),
        )
        .expect_err("unavailable fixture should fail");

    assert_eq!(age_error.code, YoutubeErrorCode::AgeRestricted);
    assert_eq!(unavailable_error.code, YoutubeErrorCode::Unavailable);
    assert!(age_error.detail.is_none());
    assert!(unavailable_error.detail.is_none());
}

#[test]
fn playlist_command_rejects_video_url_before_spawning() {
    let error = YoutubeCommandService::default()
        .import_playlist_with(
            "https://youtu.be/dQw4w9WgXcQ".to_string(),
            fixture_executables("playlist-success"),
        )
        .expect_err("video URL must not enter playlist command");

    assert_eq!(error.code, YoutubeErrorCode::UnsupportedUrl);
}
