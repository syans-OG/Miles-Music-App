use super::error::{YoutubeError, YoutubeErrorCode};
use super::types::{
    LiveStatus, ResolvedYoutubeTrack, YoutubeAudioStream, YoutubePlaylistEntry,
    YoutubePlaylistImport, YoutubeSkippedEntry,
};
use super::validation::{validate_playlist_id, validate_video_id};
use serde::Deserialize;
use url::Url;

const DEFAULT_PLAYLIST_LIMIT: usize = 100;

#[derive(Deserialize)]
struct RawPlaylist {
    id: Option<String>,
    title: Option<String>,
    #[serde(default)]
    entries: Vec<Option<RawEntry>>,
}

#[derive(Deserialize)]
struct RawEntry {
    id: Option<String>,
    title: Option<String>,
    artist: Option<String>,
    uploader: Option<String>,
    channel: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
    #[serde(default)]
    thumbnails: Vec<RawThumbnail>,
    live_status: Option<String>,
    is_live: Option<bool>,
    url: Option<String>,
    format_id: Option<String>,
    ext: Option<String>,
    acodec: Option<String>,
    vcodec: Option<String>,
    abr: Option<f64>,
}

#[derive(Deserialize)]
struct RawThumbnail {
    url: Option<String>,
    width: Option<u64>,
    height: Option<u64>,
}

pub fn normalize_playlist_json(
    contents: &str,
    expected_playlist_id: &str,
) -> Result<YoutubePlaylistImport, YoutubeError> {
    validate_playlist_id(expected_playlist_id)?;
    let raw: RawPlaylist = serde_json::from_str(contents)
        .map_err(|_| YoutubeError::new(YoutubeErrorCode::InvalidMetadata))?;
    if raw.id.as_deref() != Some(expected_playlist_id) {
        return Err(YoutubeError::new(YoutubeErrorCode::InvalidPlaylistId));
    }

    let total_candidates = raw.entries.len().min(DEFAULT_PLAYLIST_LIMIT);
    let truncated = raw.entries.len() > DEFAULT_PLAYLIST_LIMIT;
    let mut entries = Vec::new();
    let mut skipped = Vec::new();

    for (index, raw_entry) in raw
        .entries
        .into_iter()
        .take(DEFAULT_PLAYLIST_LIMIT)
        .enumerate()
    {
        let position = index + 1;
        match normalize_playlist_entry(raw_entry, position) {
            Ok(entry) => entries.push(entry),
            Err(skipped_entry) => skipped.push(skipped_entry),
        }
    }

    Ok(YoutubePlaylistImport {
        playlist_id: expected_playlist_id.to_string(),
        title: normalize_text(raw.title.as_deref(), "YouTube Playlist", 200),
        canonical_url: canonical_playlist_url(expected_playlist_id),
        entries,
        skipped,
        total_candidates,
        truncated,
    })
}

pub fn normalize_track_json(contents: &str) -> Result<ResolvedYoutubeTrack, YoutubeError> {
    let raw: RawEntry = serde_json::from_str(contents)
        .map_err(|_| YoutubeError::new(YoutubeErrorCode::InvalidMetadata))?;
    let video_id = raw
        .id
        .as_deref()
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::InvalidVideoId))?;
    validate_video_id(video_id)?;
    let live_status = parse_live_status(raw.live_status.as_deref(), raw.is_live);
    reject_unsupported_live(live_status)?;
    let duration_seconds = normalize_duration(raw.duration)
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::InvalidMetadata))?;
    let stream_url = raw
        .url
        .as_deref()
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::AudioStreamUnavailable))?;
    let parsed_stream = validate_stream_url(stream_url)?;
    let extension = raw.ext.as_deref().unwrap_or_default().to_ascii_lowercase();
    let audio_codec = raw.acodec.as_deref().unwrap_or_default().to_string();
    if !matches!(extension.as_str(), "m4a" | "mp4" | "aac")
        || audio_codec.is_empty()
        || audio_codec == "none"
        || raw.vcodec.as_deref().is_some_and(|codec| codec != "none")
    {
        return Err(YoutubeError::new(YoutubeErrorCode::AudioStreamUnavailable));
    }

    Ok(ResolvedYoutubeTrack {
        video_id: video_id.to_string(),
        title: normalize_text(raw.title.as_deref(), "Untitled YouTube Track", 300),
        artist: normalize_artist(&raw),
        duration_seconds,
        thumbnail_url: select_thumbnail(&raw),
        canonical_url: canonical_video_url(video_id),
        live_status,
        stream: YoutubeAudioStream {
            url: stream_url.to_string(),
            format_id: normalize_optional_text(raw.format_id.as_deref(), 64),
            extension,
            audio_codec,
            average_bitrate_kbps: raw
                .abr
                .filter(|bitrate| bitrate.is_finite() && *bitrate > 0.0),
            expires_at_unix: parsed_stream
                .query_pairs()
                .find(|(key, _)| key == "expire")
                .and_then(|(_, value)| value.parse().ok()),
        },
    })
}

fn normalize_playlist_entry(
    raw_entry: Option<RawEntry>,
    position: usize,
) -> Result<YoutubePlaylistEntry, YoutubeSkippedEntry> {
    let raw = raw_entry
        .ok_or_else(|| skipped(position, None, None, YoutubeErrorCode::InvalidMetadata))?;
    let video_id = raw.id.as_deref();
    let title = normalize_optional_text(raw.title.as_deref(), 300);
    if video_id.map_or(true, |id| validate_video_id(id).is_err()) {
        return Err(skipped(
            position,
            video_id,
            title.as_deref(),
            YoutubeErrorCode::InvalidVideoId,
        ));
    }

    let video_id = video_id.unwrap_or_default();
    let live_status = parse_live_status(raw.live_status.as_deref(), raw.is_live);
    let reason = match live_status {
        LiveStatus::IsLive => Some(YoutubeErrorCode::LiveUnsupported),
        LiveStatus::IsUpcoming => Some(YoutubeErrorCode::UpcomingUnsupported),
        LiveStatus::WasLive if normalize_duration(raw.duration).is_none() => {
            Some(YoutubeErrorCode::InvalidMetadata)
        }
        _ => None,
    };
    if let Some(reason) = reason {
        return Err(skipped(position, Some(video_id), title.as_deref(), reason));
    }

    Ok(YoutubePlaylistEntry {
        position,
        video_id: video_id.to_string(),
        title: title.unwrap_or_else(|| "Untitled YouTube Track".to_string()),
        artist: normalize_artist(&raw),
        duration_seconds: normalize_duration(raw.duration),
        thumbnail_url: select_thumbnail(&raw),
        canonical_url: canonical_video_url(video_id),
        live_status,
    })
}

fn reject_unsupported_live(live_status: LiveStatus) -> Result<(), YoutubeError> {
    match live_status {
        LiveStatus::IsLive => Err(YoutubeError::new(YoutubeErrorCode::LiveUnsupported)),
        LiveStatus::IsUpcoming => Err(YoutubeError::new(YoutubeErrorCode::UpcomingUnsupported)),
        _ => Ok(()),
    }
}

fn parse_live_status(status: Option<&str>, is_live: Option<bool>) -> LiveStatus {
    if is_live == Some(true) {
        return LiveStatus::IsLive;
    }
    match status {
        Some("not_live") => LiveStatus::NotLive,
        Some("is_live") => LiveStatus::IsLive,
        Some("is_upcoming") => LiveStatus::IsUpcoming,
        Some("was_live") => LiveStatus::WasLive,
        Some(_) => LiveStatus::Unknown,
        None => LiveStatus::NotLive,
    }
}

fn normalize_duration(duration: Option<f64>) -> Option<u64> {
    duration
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.round() as u64)
}

fn normalize_artist(raw: &RawEntry) -> String {
    [
        raw.artist.as_deref(),
        raw.uploader.as_deref(),
        raw.channel.as_deref(),
    ]
    .into_iter()
    .flatten()
    .find_map(|value| normalize_optional_text(Some(value), 200))
    .unwrap_or_else(|| "Unknown Artist".to_string())
}

fn select_thumbnail(raw: &RawEntry) -> Option<String> {
    let best = raw
        .thumbnails
        .iter()
        .filter_map(|thumbnail| {
            let url = valid_https_url(thumbnail.url.as_deref()?)?;
            let area = thumbnail.width.unwrap_or(0) * thumbnail.height.unwrap_or(0);
            Some((area, url))
        })
        .max_by_key(|(area, _)| *area)
        .map(|(_, url)| url);
    best.or_else(|| raw.thumbnail.as_deref().and_then(valid_https_url))
}

fn valid_https_url(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    let host = url.host_str()?;
    (url.scheme() == "https"
        && ["ytimg.com", "ggpht.com", "googleusercontent.com"]
            .iter()
            .any(|allowed| host_matches(host, allowed)))
    .then(|| value.to_string())
}

fn validate_stream_url(value: &str) -> Result<Url, YoutubeError> {
    let url = Url::parse(value)
        .map_err(|_| YoutubeError::new(YoutubeErrorCode::AudioStreamUnavailable))?;
    if url.scheme() != "https"
        || url
            .host_str()
            .map_or(true, |host| !host_matches(host, "googlevideo.com"))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(YoutubeError::new(YoutubeErrorCode::AudioStreamUnavailable));
    }
    Ok(url)
}

fn host_matches(host: &str, allowed: &str) -> bool {
    host == allowed || host.ends_with(&format!(".{allowed}"))
}

fn normalize_text(value: Option<&str>, fallback: &str, max_length: usize) -> String {
    normalize_optional_text(value, max_length).unwrap_or_else(|| fallback.to_string())
}

fn normalize_optional_text(value: Option<&str>, max_length: usize) -> Option<String> {
    let normalized: String = value?.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return None;
    }
    Some(normalized.chars().take(max_length).collect())
}

fn skipped(
    position: usize,
    video_id: Option<&str>,
    title: Option<&str>,
    reason: YoutubeErrorCode,
) -> YoutubeSkippedEntry {
    YoutubeSkippedEntry {
        position,
        video_id: video_id.map(str::to_string),
        title: title.map(str::to_string),
        reason,
    }
}

fn canonical_video_url(video_id: &str) -> String {
    format!("https://www.youtube.com/watch?v={video_id}")
}

fn canonical_playlist_url(playlist_id: &str) -> String {
    format!("https://www.youtube.com/playlist?list={playlist_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLAYLIST_ID: &str = "PLDuK_0-3anUREPpS5-EDohLzh29Zpwlv1";
    const PLAYLIST_FIXTURE: &str = include_str!("../../tests/fixtures/playlist-success.json");
    const TRACK_FIXTURE: &str = include_str!("../../tests/fixtures/track-success.json");

    #[test]
    fn normalizes_playlist_and_reports_live_skip() {
        let playlist = normalize_playlist_json(PLAYLIST_FIXTURE, PLAYLIST_ID)
            .expect("playlist fixture should normalize");

        assert_eq!(playlist.entries.len(), 1);
        assert_eq!(playlist.skipped.len(), 1);
        assert_eq!(playlist.entries[0].video_id, "dQw4w9WgXcQ");
        assert_eq!(
            playlist.skipped[0].reason,
            YoutubeErrorCode::LiveUnsupported
        );
        assert_eq!(playlist.total_candidates, 2);
        assert!(!playlist.truncated);
    }

    #[test]
    fn normalizes_resolved_track_and_expiry_hint() {
        let track = normalize_track_json(TRACK_FIXTURE).expect("track fixture should normalize");

        assert_eq!(track.video_id, "dQw4w9WgXcQ");
        assert_eq!(track.artist, "Fixture Artist");
        assert_eq!(track.duration_seconds, 212);
        assert_eq!(track.stream.extension, "m4a");
        assert_eq!(track.stream.expires_at_unix, Some(2_000_000_000));
        assert!(track
            .thumbnail_url
            .is_some_and(|url| url.contains("maxresdefault")));
    }

    #[test]
    fn rejects_malformed_and_live_track_payloads() {
        let malformed = normalize_track_json("{not-json");
        let live = normalize_track_json(
            r#"{
                "id":"dQw4w9WgXcQ",
                "title":"Live",
                "duration":30,
                "is_live":true,
                "live_status":"is_live",
                "url":"https://example.test/audio.m4a",
                "ext":"m4a",
                "acodec":"mp4a.40.2",
                "vcodec":"none"
            }"#,
        );

        assert_eq!(
            malformed.unwrap_err().code,
            YoutubeErrorCode::InvalidMetadata
        );
        assert_eq!(live.unwrap_err().code, YoutubeErrorCode::LiveUnsupported);
    }

    #[test]
    fn rejects_stream_host_outside_googlevideo() {
        let payload = r#"{
            "id":"dQw4w9WgXcQ",
            "title":"Redirected",
            "duration":30,
            "live_status":"not_live",
            "url":"https://googlevideo.com.evil.test/audio.m4a",
            "ext":"m4a",
            "acodec":"mp4a.40.2",
            "vcodec":"none"
        }"#;

        assert_eq!(
            normalize_track_json(payload).unwrap_err().code,
            YoutubeErrorCode::AudioStreamUnavailable
        );
    }

    #[test]
    fn supports_finished_live_vod_with_fixed_duration() {
        let vod = normalize_track_json(
            r#"{
                "id":"dQw4w9WgXcQ",
                "title":"Finished Live",
                "duration":120,
                "live_status":"was_live",
                "url":"https://rr.example.googlevideo.com/audio.m4a?expire=2000000001",
                "ext":"m4a",
                "acodec":"mp4a.40.2",
                "vcodec":"none"
            }"#,
        )
        .expect("finished live VOD should normalize");

        assert_eq!(vod.live_status, LiveStatus::WasLive);
        assert_eq!(vod.duration_seconds, 120);
    }
}
