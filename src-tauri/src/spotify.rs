use serde::{Deserialize, Serialize};

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
pub struct SpotifyPlaylistImport {
    pub id: String,
    pub title: String,
    pub owner: String,
    pub cover_url: Option<String>,
    pub tracks: Vec<SpotifyTrackEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpotifyImportError {
    pub code: String,
    pub message: String,
}

pub fn parse_spotify_url(url: &str) -> Option<(&str, &str)> {
    let clean = url.trim();

    // Support spotify:playlist:ID format
    if clean.starts_with("spotify:") {
        let parts: Vec<&str> = clean.split(':').collect();
        if parts.len() >= 3 {
            let resource_type = parts[1];
            let id = parts[2].split('?').next().unwrap_or(parts[2]);
            if matches!(resource_type, "playlist" | "album" | "track") && !id.is_empty() {
                return Some((resource_type, id));
            }
        }
        return None;
    }

    // Support https://open.spotify.com/{type}/{id} format
    if let Some(pos) = clean.find("open.spotify.com/") {
        let path = &clean[pos + "open.spotify.com/".len()..];
        let parts: Vec<&str> = path.split('/').collect();
        if parts.len() >= 2 {
            let resource_type = parts[0];
            let raw_id = parts[1];
            let id = raw_id.split('?').next().unwrap_or(raw_id);
            if matches!(resource_type, "playlist" | "album" | "track") && !id.is_empty() {
                return Some((resource_type, id));
            }
        }
    }

    None
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
pub async fn fetch_spotify_playlist(url: String) -> Result<SpotifyPlaylistImport, SpotifyImportError> {
    let (resource_type, resource_id) = parse_spotify_url(&url).ok_or_else(|| SpotifyImportError {
        code: "INVALID_URL".to_string(),
        message: "Invalid Spotify link. Use Spotify playlist, album, or track link format.".to_string(),
    })?;

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|e| SpotifyImportError {
            code: "HTTP_CLIENT_ERROR".to_string(),
            message: format!("Failed to initialize HTTP client: {}", e),
        })?;

    let embed_url = format!("https://open.spotify.com/embed/{}/{}", resource_type, resource_id);
    let resp = client
        .get(&embed_url)
        .send()
        .await
        .map_err(|e| SpotifyImportError {
            code: "FETCH_FAILED".to_string(),
            message: format!("Failed to connect to Spotify: {}", e),
        })?;

    let html_body = resp.text().await.map_err(|e| SpotifyImportError {
        code: "READ_FAILED".to_string(),
        message: format!("Failed to read Spotify response: {}", e),
    })?;

    // Try parsing Next.js __NEXT_DATA__ or resource script tag
    if let Some(start_tag) = html_body.find("id=\"__NEXT_DATA__\" type=\"application/json\">") {
        let json_start = start_tag + "id=\"__NEXT_DATA__\" type=\"application/json\">".len();
        if let Some(json_end) = html_body[json_start..].find("</script>") {
            let json_str = &html_body[json_start..json_start + json_end];
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(json_str) {
                if let Some(entity) = value.pointer("/props/pageProps/state/data/entity") {
                    let title = entity["name"].as_str()
                        .or_else(|| entity["title"].as_str())
                        .unwrap_or("Spotify Import");

                    let owner = entity.pointer("/owner/name").and_then(|v| v.as_str())
                        .or_else(|| entity.pointer("/artists/0/name").and_then(|v| v.as_str()))
                        .unwrap_or("Spotify");

                    let cover_url = entity.pointer("/coverArt/sources/0/url").and_then(|v| v.as_str())
                        .or_else(|| entity.pointer("/images/0/url").and_then(|v| v.as_str()))
                        .map(|s| s.to_string());

                    let mut tracks = Vec::new();
                    let raw_track_list = entity.pointer("/trackList").and_then(|v| v.as_array())
                        .or_else(|| entity.pointer("/tracks/items").and_then(|v| v.as_array()));

                    if let Some(item_list) = raw_track_list {
                        for (idx, item) in item_list.iter().enumerate() {
                            let track_obj = if item.get("track").is_some() { &item["track"] } else { item };
                            let title_str = track_obj["title"].as_str()
                                .or_else(|| track_obj["name"].as_str())
                                .unwrap_or("");

                            if title_str.is_empty() {
                                continue;
                            }

                            let artist_str = track_obj["subtitle"].as_str()
                                .or_else(|| track_obj.pointer("/artists/0/name").and_then(|v| v.as_str()))
                                .or_else(|| track_obj.pointer("/artists/0").and_then(|v| v.as_str()))
                                .unwrap_or("Unknown Artist");

                            let track_cover = track_obj.pointer("/coverArt/sources/0/url").and_then(|v| v.as_str())
                                .or_else(|| track_obj.pointer("/images/0/url").and_then(|v| v.as_str()))
                                .or_else(|| track_obj.pointer("/album/coverArt/sources/0/url").and_then(|v| v.as_str()))
                                .or_else(|| track_obj.pointer("/album/images/0/url").and_then(|v| v.as_str()))
                                .map(|s| s.to_string())
                                .or_else(|| cover_url.clone());

                            let duration_ms = track_obj["duration"].as_u64()
                                .or_else(|| track_obj["duration_ms"].as_u64())
                                .unwrap_or(180000);

                            let fallback_tid = format!("sp_{}_{}", resource_id, idx);
                            let tid = track_obj["id"].as_str().unwrap_or(&fallback_tid);

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
                            id: resource_id.to_string(),
                            title: html_escape_decode(title),
                            owner: html_escape_decode(owner),
                            cover_url,
                            tracks,
                        });
                    }
                }
            }
        }
    }

    // Fallback: oEmbed endpoint
    let oembed_url = format!("https://open.spotify.com/oembed?url=https://open.spotify.com/{}/{}", resource_type, resource_id);
    if let Ok(oembed_resp) = client.get(&oembed_url).send().await {
        if let Ok(oembed_json) = oembed_resp.json::<serde_json::Value>().await {
            let title = oembed_json["title"].as_str().unwrap_or("Spotify Playlist");
            let owner = oembed_json["author_name"].as_str().unwrap_or("Spotify");
            let cover_url = oembed_json["thumbnail_url"].as_str().map(|s| s.to_string());

            // If resource is a single track
            if resource_type == "track" {
                let parts: Vec<&str> = title.split(" - song and lyrics by ").collect();
                let song_title = parts.first().unwrap_or(&title);
                let artist_name = parts.get(1).unwrap_or(&owner);

                return Ok(SpotifyPlaylistImport {
                    id: resource_id.to_string(),
                    title: html_escape_decode(song_title),
                    owner: html_escape_decode(artist_name),
                    cover_url: cover_url.clone(),
                    tracks: vec![SpotifyTrackEntry {
                        id: resource_id.to_string(),
                        title: html_escape_decode(song_title),
                        artist: html_escape_decode(artist_name),
                        album: None,
                        cover_url,
                        duration_seconds: 180,
                        search_query: format!("{} {}", artist_name, song_title),
                    }],
                });
            }
        }
    }

    Err(SpotifyImportError {
        code: "NO_TRACKS_FOUND".to_string(),
        message: "Unable to extract track list from the Spotify link. Please make sure the link is public and accessible.".to_string(),
    })
}
