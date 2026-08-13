use super::types::{SpotifyMatchSkipReason, SpotifyTrackMatchRequest, SpotifyTrackMatchResult};
use super::{
    error::{YoutubeError, YoutubeErrorCode},
    validation::validate_video_id,
};
use serde_json::Value;
use std::collections::BTreeSet;

const MATCH_THRESHOLD: i32 = 70;
const MAX_DURATION_DIFFERENCE_SECONDS: u64 = 30;
const UNWANTED_QUALIFIERS: [&str; 8] = [
    "karaoke",
    "cover",
    "nightcore",
    "sped up",
    "slowed",
    "instrumental",
    "remix",
    "live",
];

#[derive(Clone, Debug)]
pub(crate) struct YoutubeSearchCandidate {
    pub video_id: String,
    pub title: String,
    pub artist: String,
    pub channel: String,
    pub duration_seconds: u64,
    pub thumbnail_url: Option<String>,
    pub is_live: bool,
    pub is_upcoming: bool,
    pub is_available: bool,
}

pub(crate) fn parse_youtube_search_json(
    input: &str,
) -> Result<Vec<YoutubeSearchCandidate>, YoutubeError> {
    let payload: Value = serde_json::from_str(input)
        .map_err(|_| YoutubeError::new(YoutubeErrorCode::InvalidMetadata))?;
    let entries = payload["entries"]
        .as_array()
        .ok_or_else(|| YoutubeError::new(YoutubeErrorCode::InvalidMetadata))?;

    Ok(entries.iter().filter_map(parse_candidate).collect())
}

fn parse_candidate(entry: &Value) -> Option<YoutubeSearchCandidate> {
    let video_id = entry["id"].as_str()?.trim();
    let title = entry["title"].as_str()?.trim();
    let duration_seconds = entry["duration"].as_f64()?.round() as u64;
    if video_id.len() != 11
        || validate_video_id(video_id).is_err()
        || title.is_empty()
        || duration_seconds == 0
    {
        return None;
    }

    let channel = first_text(entry, &["channel", "uploader", "artist"])
        .unwrap_or("Unknown Artist")
        .to_string();
    let artist = first_text(entry, &["artist", "uploader", "channel"])
        .unwrap_or(&channel)
        .to_string();
    let live_status = entry["live_status"].as_str().unwrap_or("not_live");
    let availability = entry["availability"].as_str().unwrap_or("public");
    let thumbnail_url = entry["thumbnail"].as_str().map(str::to_string).or_else(|| {
        entry["thumbnails"]
            .as_array()?
            .iter()
            .rev()
            .find_map(|thumbnail| thumbnail["url"].as_str().map(str::to_string))
    });

    Some(YoutubeSearchCandidate {
        video_id: video_id.to_string(),
        title: title.to_string(),
        artist,
        channel,
        duration_seconds,
        thumbnail_url,
        is_live: entry["is_live"].as_bool().unwrap_or(false) || live_status == "is_live",
        is_upcoming: live_status == "is_upcoming",
        is_available: !matches!(
            availability,
            "private" | "premium_only" | "subscriber_only" | "needs_auth" | "unavailable"
        ),
    })
}

fn first_text<'a>(entry: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|key| {
        entry[*key]
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    })
}

pub(crate) fn select_spotify_candidate(
    input: &SpotifyTrackMatchRequest,
    candidates: &[YoutubeSearchCandidate],
) -> SpotifyTrackMatchResult {
    let skipped = |reason| SpotifyTrackMatchResult::Skipped {
        spotify_id: input.spotify_id.clone(),
        reason,
    };
    if candidates.is_empty() {
        return skipped(SpotifyMatchSkipReason::NoCandidates);
    }

    let playable: Vec<_> = candidates
        .iter()
        .filter(|candidate| candidate.is_available && !candidate.is_live && !candidate.is_upcoming)
        .collect();
    if playable.is_empty() {
        return skipped(SpotifyMatchSkipReason::LiveUnsupported);
    }

    let duration_matches: Vec<_> = playable
        .into_iter()
        .filter(|candidate| duration_is_close(input.duration_seconds, candidate.duration_seconds))
        .collect();
    if duration_matches.is_empty() {
        return skipped(SpotifyMatchSkipReason::DurationMismatch);
    }

    let best = duration_matches
        .into_iter()
        .map(|candidate| (candidate, candidate_score(input, candidate)))
        .max_by(
            |(left_candidate, left_score), (right_candidate, right_score)| {
                left_score
                    .cmp(right_score)
                    .then_with(|| right_candidate.video_id.cmp(&left_candidate.video_id))
            },
        );
    let Some((candidate, score)) = best.filter(|(_, score)| *score >= MATCH_THRESHOLD) else {
        return skipped(SpotifyMatchSkipReason::WeakMatch);
    };

    SpotifyTrackMatchResult::Matched {
        spotify_id: input.spotify_id.clone(),
        video_id: candidate.video_id.clone(),
        title: candidate.title.clone(),
        artist: candidate.artist.clone(),
        duration_seconds: candidate.duration_seconds,
        thumbnail_url: candidate.thumbnail_url.clone(),
        canonical_url: format!("https://www.youtube.com/watch?v={}", candidate.video_id),
        score: score.clamp(0, 100) as u8,
    }
}

fn candidate_score(input: &SpotifyTrackMatchRequest, candidate: &YoutubeSearchCandidate) -> i32 {
    let expected_title = normalized_tokens(&input.title);
    let candidate_title = normalized_tokens(&candidate.title);
    let expected_artist = normalized_tokens(&input.artist);
    let candidate_identity = normalized_tokens(&format!(
        "{} {} {}",
        candidate.title, candidate.artist, candidate.channel
    ));
    let title_score = coverage(&expected_title, &candidate_title) * 45.0;
    let artist_score = coverage(&expected_artist, &candidate_identity) * 30.0;
    let duration_score = duration_score(input.duration_seconds, candidate.duration_seconds) * 20.0;
    let trust_bonus = source_confidence_bonus(input, candidate);
    let qualifier_penalty = unexpected_qualifier_penalty(&input.title, &candidate.title);

    (title_score + artist_score + duration_score).round() as i32 + trust_bonus - qualifier_penalty
}

fn duration_is_close(expected: u64, actual: u64) -> bool {
    if expected == 0 || actual == 0 {
        return false;
    }
    let difference = expected.abs_diff(actual);
    difference <= MAX_DURATION_DIFFERENCE_SECONDS && difference.saturating_mul(5) <= expected
}

fn duration_score(expected: u64, actual: u64) -> f64 {
    let difference = expected.abs_diff(actual) as f64;
    let allowed = (expected as f64 * 0.2).min(MAX_DURATION_DIFFERENCE_SECONDS as f64);
    (1.0 - difference / allowed.max(1.0)).clamp(0.0, 1.0)
}

fn coverage(expected: &BTreeSet<String>, candidate: &BTreeSet<String>) -> f64 {
    if expected.is_empty() {
        return 0.0;
    }
    expected.intersection(candidate).count() as f64 / expected.len() as f64
}

fn normalized_tokens(value: &str) -> BTreeSet<String> {
    const IGNORED: [&str; 8] = [
        "official",
        "video",
        "audio",
        "lyrics",
        "lyric",
        "visualizer",
        "hd",
        "4k",
    ];
    let normalized: String = value
        .chars()
        .flat_map(char::to_lowercase)
        .map(|character| {
            if character.is_alphanumeric() {
                character
            } else {
                ' '
            }
        })
        .collect();
    normalized
        .split_whitespace()
        .filter(|token| !IGNORED.contains(token))
        .map(str::to_string)
        .collect()
}

fn source_confidence_bonus(
    input: &SpotifyTrackMatchRequest,
    candidate: &YoutubeSearchCandidate,
) -> i32 {
    let title = candidate.title.to_lowercase();
    let channel = candidate.channel.to_lowercase();
    let artist_tokens = normalized_tokens(&input.artist);
    let channel_tokens = normalized_tokens(&channel);
    let is_official_format = title.contains("official audio") || title.contains("official video");
    let is_artist_channel = coverage(&artist_tokens, &channel_tokens) >= 0.5;
    let is_topic_channel = channel.ends_with(" - topic") || channel.ends_with(" topic");
    if is_official_format || is_artist_channel || is_topic_channel {
        5
    } else {
        0
    }
}

fn unexpected_qualifier_penalty(expected_title: &str, candidate_title: &str) -> i32 {
    let expected = expected_title.to_lowercase();
    let candidate = candidate_title.to_lowercase();
    UNWANTED_QUALIFIERS
        .iter()
        .filter(|qualifier| candidate.contains(**qualifier) && !expected.contains(**qualifier))
        .count() as i32
        * 35
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::youtube::types::{
        SpotifyMatchSkipReason, SpotifyTrackMatchRequest, SpotifyTrackMatchResult,
    };

    fn input() -> SpotifyTrackMatchRequest {
        SpotifyTrackMatchRequest {
            spotify_id: "4xF4ZBGPZKxECeDFrqSAG4".to_string(),
            title: "Sunflower".to_string(),
            artist: "Post Malone Swae Lee".to_string(),
            duration_seconds: 158,
        }
    }

    fn candidate(title: &str, artist: &str, duration_seconds: u64) -> YoutubeSearchCandidate {
        YoutubeSearchCandidate {
            video_id: "ApXoWvfEYVU".to_string(),
            title: title.to_string(),
            artist: artist.to_string(),
            channel: artist.to_string(),
            duration_seconds,
            thumbnail_url: None,
            is_live: false,
            is_upcoming: false,
            is_available: true,
        }
    }

    #[test]
    fn selects_a_close_official_match() {
        let candidates = vec![candidate(
            "Post Malone, Swae Lee - Sunflower (Official Audio)",
            "Post Malone",
            158,
        )];

        let result = select_spotify_candidate(&input(), &candidates);
        assert!(matches!(
            result,
            SpotifyTrackMatchResult::Matched {
                score: 70..=100,
                ..
            }
        ));
    }

    #[test]
    fn selects_the_real_heat_waves_search_result() {
        let input = SpotifyTrackMatchRequest {
            spotify_id: "3USxtqRwSYz57Ewm6wWRMp".to_string(),
            title: "Heat Waves".to_string(),
            artist: "Glass Animals".to_string(),
            duration_seconds: 238,
        };
        let mut result = candidate(
            "Glass Animals - Heat Waves (Official Video)",
            "Glass Animals",
            236,
        );
        result.video_id = "mRD0-GxqHVo".to_string();

        assert!(matches!(
            select_spotify_candidate(&input, &[result]),
            SpotifyTrackMatchResult::Matched {
                video_id,
                score: 90..=100,
                ..
            } if video_id == "mRD0-GxqHVo"
        ));
    }

    #[test]
    fn rejects_karaoke_and_different_artist_results() {
        let candidates = vec![
            candidate("Sunflower Karaoke Version", "Karaoke Studio", 158),
            candidate("Sunflower", "Rex Orange County", 159),
        ];

        assert!(matches!(
            select_spotify_candidate(&input(), &candidates),
            SpotifyTrackMatchResult::Skipped {
                reason: SpotifyMatchSkipReason::WeakMatch,
                ..
            }
        ));
    }

    #[test]
    fn rejects_live_and_large_duration_mismatches() {
        let mut live = candidate("Sunflower", "Post Malone", 158);
        live.is_live = true;
        let long = candidate("Sunflower", "Post Malone", 260);

        assert!(matches!(
            select_spotify_candidate(&input(), &[live]),
            SpotifyTrackMatchResult::Skipped {
                reason: SpotifyMatchSkipReason::LiveUnsupported,
                ..
            }
        ));
        assert!(matches!(
            select_spotify_candidate(&input(), &[long]),
            SpotifyTrackMatchResult::Skipped {
                reason: SpotifyMatchSkipReason::DurationMismatch,
                ..
            }
        ));
    }

    #[test]
    fn keeps_expected_version_qualifiers() {
        let mut remix_input = input();
        remix_input.title = "Sunflower Remix".to_string();
        let candidates = vec![candidate("Sunflower Remix", "Post Malone Swae Lee", 160)];

        assert!(matches!(
            select_spotify_candidate(&remix_input, &candidates),
            SpotifyTrackMatchResult::Matched { .. }
        ));
    }

    #[test]
    fn parses_bounded_search_metadata_without_stream_urls() {
        let payload = r#"{
          "entries": [
            {
              "id": "ApXoWvfEYVU",
              "title": "Post Malone, Swae Lee - Sunflower (Official Audio)",
              "artist": "Post Malone",
              "channel": "Post Malone",
              "duration": 158,
              "thumbnail": "https://i.ytimg.com/vi/ApXoWvfEYVU/hqdefault.jpg",
              "live_status": "not_live",
              "availability": "public"
            },
            {
              "id": "bad",
              "title": "Malformed",
              "duration": 158
            }
          ]
        }"#;

        let candidates = parse_youtube_search_json(payload).expect("search fixture should parse");
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].video_id, "ApXoWvfEYVU");
        assert_eq!(candidates[0].duration_seconds, 158);
        assert!(!payload.contains("googlevideo.com"));
    }
}
