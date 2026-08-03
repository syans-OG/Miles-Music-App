use super::error::{YoutubeError, YoutubeErrorCode};
use super::types::YoutubeResource;
use url::Url;

const MAX_URL_LENGTH: usize = 2_048;
const YOUTUBE_HOSTS: [&str; 4] = [
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "music.youtube.com",
];

pub fn parse_youtube_url(input: &str) -> Result<YoutubeResource, YoutubeError> {
    let input = input.trim();
    if input.is_empty() || input.len() > MAX_URL_LENGTH || input.starts_with('-') {
        return Err(YoutubeError::new(YoutubeErrorCode::InvalidUrl));
    }

    let url = Url::parse(input).map_err(|_| YoutubeError::new(YoutubeErrorCode::InvalidUrl))?;
    validate_url_boundary(&url)?;
    let host = url
        .host_str()
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::UnsupportedHost))?;

    if host == "youtu.be" {
        return parse_short_url(&url);
    }
    if !YOUTUBE_HOSTS.contains(&host) {
        return Err(YoutubeError::new(YoutubeErrorCode::UnsupportedHost));
    }

    parse_youtube_host_url(&url)
}

pub fn validate_video_id(video_id: &str) -> Result<(), YoutubeError> {
    if video_id.len() == 11 && has_only_id_characters(video_id) {
        Ok(())
    } else {
        Err(YoutubeError::new(YoutubeErrorCode::InvalidVideoId))
    }
}

pub fn validate_playlist_id(playlist_id: &str) -> Result<(), YoutubeError> {
    if (10..=80).contains(&playlist_id.len()) && has_only_id_characters(playlist_id) {
        Ok(())
    } else {
        Err(YoutubeError::new(YoutubeErrorCode::InvalidPlaylistId))
    }
}

fn validate_url_boundary(url: &Url) -> Result<(), YoutubeError> {
    if url.scheme() != "https" {
        return Err(YoutubeError::new(YoutubeErrorCode::HttpsRequired));
    }
    if !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return Err(YoutubeError::new(YoutubeErrorCode::InvalidUrl));
    }
    Ok(())
}

fn parse_short_url(url: &Url) -> Result<YoutubeResource, YoutubeError> {
    if let Some(playlist_id) = unique_query_value(url, "list")? {
        return playlist_resource(&playlist_id);
    }
    let mut segments = url
        .path_segments()
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::UnsupportedUrl))?;
    let video_id = segments
        .next()
        .filter(|segment| !segment.is_empty())
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::UnsupportedUrl))?;
    if segments.next().is_some() {
        return Err(YoutubeError::new(YoutubeErrorCode::UnsupportedUrl));
    }
    video_resource(video_id)
}

fn parse_youtube_host_url(url: &Url) -> Result<YoutubeResource, YoutubeError> {
    if let Some(playlist_id) = unique_query_value(url, "list")? {
        return playlist_resource(&playlist_id);
    }

    if url.path() == "/watch" {
        let video_id = unique_query_value(url, "v")?
            .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::InvalidVideoId))?;
        return video_resource(&video_id);
    }

    let mut segments = url
        .path_segments()
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::UnsupportedUrl))?;
    let route = segments.next().unwrap_or_default();
    let video_id = segments.next().unwrap_or_default();
    if matches!(route, "shorts" | "embed" | "live" | "v") && segments.next().is_none() {
        return video_resource(video_id);
    }

    Err(YoutubeError::new(YoutubeErrorCode::UnsupportedUrl))
}

fn unique_query_value(url: &Url, key: &str) -> Result<Option<String>, YoutubeError> {
    let values: Vec<_> = url
        .query_pairs()
        .filter(|(name, _)| name == key)
        .map(|(_, value)| value.into_owned())
        .collect();
    if values.len() > 1 {
        return Err(YoutubeError::new(YoutubeErrorCode::InvalidUrl));
    }
    Ok(values.into_iter().next().filter(|value| !value.is_empty()))
}

fn video_resource(video_id: &str) -> Result<YoutubeResource, YoutubeError> {
    validate_video_id(video_id)?;
    Ok(YoutubeResource::Video {
        video_id: video_id.to_string(),
        canonical_url: format!("https://www.youtube.com/watch?v={video_id}"),
    })
}

fn playlist_resource(playlist_id: &str) -> Result<YoutubeResource, YoutubeError> {
    validate_playlist_id(playlist_id)?;
    Ok(YoutubeResource::Playlist {
        playlist_id: playlist_id.to_string(),
        canonical_url: format!("https://www.youtube.com/playlist?list={playlist_id}"),
    })
}

fn has_only_id_characters(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PLAYLIST_ID: &str = "PLDuK_0-3anUREPpS5-EDohLzh29Zpwlv1";
    const VIDEO_ID: &str = "dQw4w9WgXcQ";

    #[test]
    fn parses_supported_video_and_playlist_variants() {
        let playlist = parse_youtube_url(&format!(
            "https://youtube.com/playlist?list={PLAYLIST_ID}&si=fixture"
        ));
        let short = parse_youtube_url(&format!("https://youtu.be/{VIDEO_ID}?si=fixture"));
        let shorts = parse_youtube_url(&format!("https://www.youtube.com/shorts/{VIDEO_ID}"));

        assert!(matches!(playlist, Ok(YoutubeResource::Playlist { .. })));
        assert!(matches!(short, Ok(YoutubeResource::Video { .. })));
        assert!(matches!(shorts, Ok(YoutubeResource::Video { .. })));
    }

    #[test]
    fn treats_playlist_context_as_playlist() {
        let resource =
            parse_youtube_url(&format!("https://youtu.be/{VIDEO_ID}?list={PLAYLIST_ID}"));

        assert!(matches!(resource, Ok(YoutubeResource::Playlist { .. })));
    }

    #[test]
    fn rejects_untrusted_url_boundaries() {
        let invalid_urls = [
            "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
            "https://youtube.com@evil.test/watch?v=dQw4w9WgXcQ",
            "https://user@youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtube.com:444/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ/extra",
            "--config-location=attack.conf",
        ];

        for input in invalid_urls {
            assert!(parse_youtube_url(input).is_err(), "accepted {input}");
        }
    }

    #[test]
    fn rejects_malformed_and_ambiguous_ids() {
        let malformed = parse_youtube_url("https://youtube.com/watch?v=too-short");
        let duplicate = parse_youtube_url("https://youtube.com/watch?v=dQw4w9WgXcQ&v=aaaaaaaaaaa");
        let invalid_playlist = parse_youtube_url("https://youtube.com/playlist?list=bad!");

        assert_eq!(
            malformed.unwrap_err().code,
            YoutubeErrorCode::InvalidVideoId
        );
        assert_eq!(duplicate.unwrap_err().code, YoutubeErrorCode::InvalidUrl);
        assert_eq!(
            invalid_playlist.unwrap_err().code,
            YoutubeErrorCode::InvalidPlaylistId
        );
    }
}
