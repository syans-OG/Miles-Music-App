use serde::{Deserialize, Serialize};
use url::Url;

const SPOTIFY_HOST: &str = "open.spotify.com";
const SPOTIFY_ID_LENGTH: usize = 22;
const MAX_SPOTIFY_RESPONSE_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyTrackEntry {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub cover_url: Option<String>,
    pub duration_seconds: u32,
    pub search_query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifySkippedTrack {
    pub title: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyPlaylistImport {
    pub resource_type: String,
    pub id: String,
    pub title: String,
    pub owner: String,
    pub cover_url: Option<String>,
    pub tracks: Vec<SpotifyTrackEntry>,
    pub skipped: Vec<SpotifySkippedTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyImportError {
    pub code: String,
    pub message: String,
}

fn is_supported_resource_type(value: &str) -> bool {
    matches!(value, "playlist" | "album" | "track")
}

fn is_valid_spotify_id(value: &str) -> bool {
    value.len() == SPOTIFY_ID_LENGTH && value.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

fn extract_spotify_track_id(track: &serde_json::Value) -> Option<&str> {
    track["id"]
        .as_str()
        .filter(|id| is_valid_spotify_id(id))
        .or_else(|| {
            track["uri"]
                .as_str()?
                .strip_prefix("spotify:track:")
                .filter(|id| is_valid_spotify_id(id))
        })
}

pub fn parse_spotify_url(url: &str) -> Option<(String, String)> {
    let clean = url.trim();

    if clean.starts_with("spotify:") {
        let parts: Vec<&str> = clean.split(':').collect();
        if parts.len() == 3 && is_supported_resource_type(parts[1]) && is_valid_spotify_id(parts[2])
        {
            return Some((parts[1].to_string(), parts[2].to_string()));
        }
        return None;
    }

    let parsed = Url::parse(clean).ok()?;
    if parsed.scheme() != "https"
        || parsed.host_str() != Some(SPOTIFY_HOST)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.port().is_some()
        || parsed.fragment().is_some()
    {
        return None;
    }

    let path_parts: Vec<&str> = parsed
        .path_segments()?
        .filter(|part| !part.is_empty())
        .collect();
    if path_parts.len() != 2
        || !is_supported_resource_type(path_parts[0])
        || !is_valid_spotify_id(path_parts[1])
    {
        return None;
    }

    Some((path_parts[0].to_string(), path_parts[1].to_string()))
}

fn spotify_error(code: &str, message: &str) -> SpotifyImportError {
    SpotifyImportError {
        code: code.to_string(),
        message: message.to_string(),
    }
}

fn append_bounded(
    body: &mut Vec<u8>,
    chunk: &[u8],
    maximum_bytes: usize,
) -> Result<(), SpotifyImportError> {
    if body.len().saturating_add(chunk.len()) > maximum_bytes {
        return Err(spotify_error(
            "RESPONSE_TOO_LARGE",
            "Spotify returned more data than Miles can safely process.",
        ));
    }
    body.extend_from_slice(chunk);
    Ok(())
}

async fn fetch_bounded_text(
    client: &reqwest::Client,
    url: &str,
) -> Result<String, SpotifyImportError> {
    let response = client.get(url).send().await.map_err(|_| {
        spotify_error(
            "FETCH_FAILED",
            "Miles could not connect to Spotify. Please try again.",
        )
    })?;

    if response
        .content_length()
        .is_some_and(|length| length > MAX_SPOTIFY_RESPONSE_BYTES as u64)
    {
        return Err(spotify_error(
            "RESPONSE_TOO_LARGE",
            "Spotify returned more data than Miles can safely process.",
        ));
    }

    let mut response = response.error_for_status().map_err(|_| {
        spotify_error(
            "SPOTIFY_HTTP_ERROR",
            "Spotify did not accept the request. Check that the link is public and available.",
        )
    })?;
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        spotify_error(
            "READ_FAILED",
            "Miles could not read Spotify's response. Please try again.",
        )
    })? {
        append_bounded(&mut body, &chunk, MAX_SPOTIFY_RESPONSE_BYTES)?;
    }

    String::from_utf8(body).map_err(|_| {
        spotify_error(
            "INVALID_RESPONSE",
            "Spotify returned a response Miles could not process.",
        )
    })
}

fn html_escape_decode(input: &str) -> String {
    input
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[tauri::command]
pub async fn fetch_spotify_playlist(
    url: String,
) -> Result<SpotifyPlaylistImport, SpotifyImportError> {
    let (resource_type, resource_id) = parse_spotify_url(&url).ok_or_else(|| {
        spotify_error(
            "INVALID_URL",
            "Invalid Spotify link. Use Spotify playlist, album, or track link format.",
        )
    })?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|_| {
            spotify_error(
                "HTTP_CLIENT_ERROR",
                "Miles could not initialize the Spotify connection.",
            )
        })?;

    let embed_url = format!(
        "https://open.spotify.com/embed/{}/{}",
        resource_type, resource_id
    );
    let html_body = fetch_bounded_text(&client, &embed_url).await?;

    // Try parsing Next.js __NEXT_DATA__ or resource script tag
    if let Some(start_tag) = html_body.find("id=\"__NEXT_DATA__\" type=\"application/json\">") {
        let json_start = start_tag + "id=\"__NEXT_DATA__\" type=\"application/json\">".len();
        if let Some(json_end) = html_body[json_start..].find("</script>") {
            let json_str = &html_body[json_start..json_start + json_end];
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(entity) = value.pointer("/props/pageProps/state/data/entity") {
                    let title = entity["name"]
                        .as_str()
                        .or_else(|| entity["title"].as_str())
                        .unwrap_or("Spotify Import");

                    let owner = entity
                        .pointer("/owner/name")
                        .and_then(|v| v.as_str())
                        .or_else(|| entity.pointer("/artists/0/name").and_then(|v| v.as_str()))
                        .unwrap_or("Spotify");

                    let cover_url = entity
                        .pointer("/coverArt/sources/0/url")
                        .and_then(|v| v.as_str())
                        .or_else(|| entity.pointer("/images/0/url").and_then(|v| v.as_str()))
                        .map(|s| s.to_string());

                    let mut tracks = Vec::new();
                    let mut skipped = Vec::new();
                    let raw_track_list = entity
                        .pointer("/trackList")
                        .and_then(|v| v.as_array())
                        .or_else(|| entity.pointer("/tracks/items").and_then(|v| v.as_array()));

                    if let Some(item_list) = raw_track_list {
                        for item in item_list {
                            let track_obj = if item.get("track").is_some() {
                                &item["track"]
                            } else {
                                item
                            };
                            let title_str = track_obj["title"]
                                .as_str()
                                .or_else(|| track_obj["name"].as_str())
                                .unwrap_or("");

                            if title_str.is_empty() {
                                skipped.push(SpotifySkippedTrack {
                                    title: None,
                                    reason: "missing_title".to_string(),
                                });
                                continue;
                            }

                            let artist_str = track_obj["subtitle"]
                                .as_str()
                                .or_else(|| {
                                    track_obj
                                        .pointer("/artists/0/name")
                                        .and_then(|v| v.as_str())
                                })
                                .or_else(|| {
                                    track_obj.pointer("/artists/0").and_then(|v| v.as_str())
                                })
                                .unwrap_or("Unknown Artist");

                            let track_cover = track_obj
                                .pointer("/coverArt/sources/0/url")
                                .and_then(|v| v.as_str())
                                .or_else(|| {
                                    track_obj.pointer("/images/0/url").and_then(|v| v.as_str())
                                })
                                .or_else(|| {
                                    track_obj
                                        .pointer("/album/coverArt/sources/0/url")
                                        .and_then(|v| v.as_str())
                                })
                                .or_else(|| {
                                    track_obj
                                        .pointer("/album/images/0/url")
                                        .and_then(|v| v.as_str())
                                })
                                .map(|s| s.to_string());

                            let duration_ms = track_obj["duration"]
                                .as_u64()
                                .or_else(|| track_obj["duration_ms"].as_u64())
                                .unwrap_or(180000);

                            let Some(tid) = extract_spotify_track_id(track_obj) else {
                                skipped.push(SpotifySkippedTrack {
                                    title: if title_str.is_empty() {
                                        None
                                    } else {
                                        Some(title_str.to_string())
                                    },
                                    reason: "invalid_track_id".to_string(),
                                });
                                continue;
                            };

                            let search_q = format!("{} {}", artist_str, title_str);

                            tracks.push(SpotifyTrackEntry {
                                id: tid.to_string(),
                                title: html_escape_decode(title_str),
                                artist: html_escape_decode(artist_str),
                                album: Some(html_escape_decode(title)),
                                cover_url: track_cover,
                                duration_seconds: (duration_ms / 1000) as u32,
                                search_query: search_q,
                            });
                        }
                    }

                    if !tracks.is_empty() {
                        return Ok(SpotifyPlaylistImport {
                            resource_type: resource_type.clone(),
                            id: resource_id.clone(),
                            title: html_escape_decode(title),
                            owner: html_escape_decode(owner),
                            cover_url,
                            tracks,
                            skipped,
                        });
                    }
                }
            }
        }
    }

    // Fallback: oEmbed endpoint
    let oembed_url = format!(
        "https://open.spotify.com/oembed?url=https://open.spotify.com/{}/{}",
        resource_type, resource_id
    );
    if let Ok(oembed_body) = fetch_bounded_text(&client, &oembed_url).await {
        if let Ok(oembed_json) = serde_json::from_str::<serde_json::Value>(&oembed_body) {
            let title = oembed_json["title"].as_str().unwrap_or("Spotify Playlist");
            let owner = oembed_json["author_name"].as_str().unwrap_or("Spotify");
            let cover_url = oembed_json["thumbnail_url"].as_str().map(|s| s.to_string());

            // If resource is a single track
            if resource_type == "track" {
                let parts: Vec<&str> = title.split(" - song and lyrics by ").collect();
                let song_title = parts.first().unwrap_or(&title);
                let artist_name = parts.get(1).unwrap_or(&owner);

                return Ok(SpotifyPlaylistImport {
                    resource_type: resource_type.clone(),
                    id: resource_id.clone(),
                    title: html_escape_decode(song_title),
                    owner: html_escape_decode(artist_name),
                    cover_url: cover_url.clone(),
                    tracks: vec![SpotifyTrackEntry {
                        id: resource_id.clone(),
                        title: html_escape_decode(song_title),
                        artist: html_escape_decode(artist_name),
                        album: None,
                        cover_url,
                        duration_seconds: 180,
                        search_query: format!("{} {}", artist_name, song_title),
                    }],
                    skipped: Vec::new(),
                });
            }
        }
    }

    Err(SpotifyImportError {
        code: "NO_TRACKS_FOUND".to_string(),
        message: "Unable to extract track list from the Spotify link. Please make sure the link is public and accessible.".to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::{append_bounded, extract_spotify_track_id, parse_spotify_url};

    #[test]
    fn accepts_supported_spotify_urls_and_uris() {
        assert_eq!(
            parse_spotify_url("https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH?si=test"),
            Some(("track".to_string(), "0VjIdWI8SuT4Ytz7vLmrCH".to_string()))
        );
        assert_eq!(
            parse_spotify_url("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"),
            Some(("playlist".to_string(), "37i9dQZF1DXcBWIGoYBM5M".to_string()))
        );
    }

    #[test]
    fn extracts_playlist_track_id_from_spotify_uri() {
        let track = serde_json::json!({
            "uri": "spotify:track:3USxtqRwSYz57Ewm6wWRMp",
            "id": null
        });

        assert_eq!(
            extract_spotify_track_id(&track),
            Some("3USxtqRwSYz57Ewm6wWRMp")
        );
        assert_eq!(extract_spotify_track_id(&serde_json::json!({})), None);
        assert_eq!(
            extract_spotify_track_id(
                &serde_json::json!({ "uri": "spotify:album:4eLPsYPBmXABThSJ8zWzBB" })
            ),
            None
        );
    }

    #[test]
    fn rejects_untrusted_boundaries_and_malformed_ids() {
        for input in [
            "https://evil.example/open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH",
            "http://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH",
            "https://user:pass@open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH",
            "https://open.spotify.com/track/short",
            "https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH/extra",
            "https://open.spotify.com/track/0VjIdWI8SuT4Ytz7vLmrCH#fragment",
            "spotify:track:0VjIdWI8SuT4Ytz7vLmrCH:extra",
        ] {
            assert_eq!(parse_spotify_url(input), None, "accepted {input}");
        }
    }

    #[test]
    fn rejects_response_chunks_above_the_configured_limit() {
        let mut body = vec![1, 2, 3];
        assert!(append_bounded(&mut body, &[4], 4).is_ok());
        assert_eq!(body, vec![1, 2, 3, 4]);

        let error = append_bounded(&mut body, &[5], 4).unwrap_err();
        assert_eq!(error.code, "RESPONSE_TOO_LARGE");
        assert_eq!(body, vec![1, 2, 3, 4]);
    }
}
