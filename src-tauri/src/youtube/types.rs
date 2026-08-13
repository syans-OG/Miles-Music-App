use super::error::YoutubeErrorCode;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportYoutubePlaylistRequest {
    pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveYoutubeTrackRequest {
    pub video_id: String,
}

#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResolvePurpose {
    #[default]
    ExplicitSelection,
    SequentialNext,
    Prefetch,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum YoutubeResource {
    Video {
        video_id: String,
        canonical_url: String,
    },
    Playlist {
        playlist_id: String,
        canonical_url: String,
    },
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveStatus {
    #[default]
    NotLive,
    IsLive,
    IsUpcoming,
    WasLive,
    Unknown,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubePlaylistImport {
    pub playlist_id: String,
    pub title: String,
    pub canonical_url: String,
    pub entries: Vec<YoutubePlaylistEntry>,
    pub skipped: Vec<YoutubeSkippedEntry>,
    pub total_candidates: usize,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubePlaylistEntry {
    pub position: usize,
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub duration_seconds: Option<u64>,
    pub thumbnail_url: Option<String>,
    pub canonical_url: String,
    pub live_status: LiveStatus,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeSkippedEntry {
    pub position: usize,
    pub video_id: Option<String>,
    pub title: Option<String>,
    pub reason: YoutubeErrorCode,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedYoutubeTrack {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub duration_seconds: u64,
    pub thumbnail_url: Option<String>,
    pub canonical_url: String,
    pub live_status: LiveStatus,
    pub stream: YoutubeAudioStream,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeAudioStream {
    pub url: String,
    pub format_id: Option<String>,
    pub extension: String,
    pub audio_codec: String,
    pub average_bitrate_kbps: Option<f64>,
    pub expires_at_unix: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyTrackMatchRequest {
    pub spotify_id: String,
    pub title: String,
    pub artist: String,
    pub duration_seconds: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpotifyMatchSkipReason {
    NoCandidates,
    LiveUnsupported,
    DurationMismatch,
    WeakMatch,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum SpotifyTrackMatchResult {
    #[serde(rename = "matched")]
    Matched {
        spotify_id: String,
        video_id: String,
        title: String,
        artist: String,
        duration_seconds: u64,
        thumbnail_url: Option<String>,
        canonical_url: String,
        score: u8,
    },
    #[serde(rename = "skipped")]
    Skipped {
        spotify_id: String,
        reason: SpotifyMatchSkipReason,
    },
}
