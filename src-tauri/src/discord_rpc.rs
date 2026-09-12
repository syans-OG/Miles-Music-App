use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_CLIENT_ID: &str = "1534752337543954512";

fn valid_client_id(value: &str) -> bool {
    let trimmed = value.trim();
    (17..=20).contains(&trimmed.len()) && trimmed.bytes().all(|b| b.is_ascii_digit())
}

fn valid_cover_url(value: &str) -> bool {
    if !value.starts_with("https://") {
        return false;
    }
    let rest = match value.split_once("://") {
        Some((_, rest)) => rest,
        None => return false,
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') || authority.contains(':') {
        return false;
    }
    const ALLOWED_HOSTS: [&str; 3] = ["i.scdn.co", "i.ytimg.com", "images.unsplash.com"];
    let host = authority.to_ascii_lowercase();
    ALLOWED_HOSTS
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")))
}

pub struct DiscordRpcState {
    client: Option<DiscordIpcClient>,
    current_client_id: String,
}

struct DiscordActivityInput<'a> {
    title: &'a str,
    artist: &'a str,
    cover_url: Option<&'a str>,
    is_playing: bool,
    current_time: u64,
    duration: u64,
    client_id: Option<&'a str>,
}

impl DiscordRpcState {
    pub fn new() -> Self {
        Self {
            client: None,
            current_client_id: DEFAULT_CLIENT_ID.to_string(),
        }
    }

    fn ensure_connected(
        &mut self,
        client_id: Option<&str>,
    ) -> Result<&mut DiscordIpcClient, String> {
        let target_id = client_id.unwrap_or(DEFAULT_CLIENT_ID).trim();
        let target_id = if valid_client_id(target_id) {
            target_id
        } else {
            DEFAULT_CLIENT_ID
        };

        if self.current_client_id != target_id {
            if let Some(mut client) = self.client.take() {
                let _ = client.close();
            }
            self.current_client_id = target_id.to_string();
        }

        if self.client.is_none() {
            let mut client = DiscordIpcClient::new(&self.current_client_id)
                .map_err(|e| format!("Failed to create Discord client: {}", e))?;
            client
                .connect()
                .map_err(|e| format!("Failed to connect to Discord: {}", e))?;
            self.client = Some(client);
        }

        Ok(self
            .client
            .as_mut()
            .expect("client was just created in ensure_connected"))
    }

    fn update_activity(&mut self, input: DiscordActivityInput<'_>) -> Result<(), String> {
        let client = self.ensure_connected(input.client_id)?;

        let trimmed_artist = input.artist.trim();
        let trimmed_title = input.title.trim();

        let state_text =
            if trimmed_artist.is_empty() || trimmed_artist.eq_ignore_ascii_case(trimmed_title) {
                String::new()
            } else {
                trimmed_artist.to_string()
            };

        let has_http_cover = input.cover_url.map(valid_cover_url).unwrap_or(false);

        let assets = if has_http_cover {
            let img_url = input.cover_url.unwrap_or_default();
            activity::Assets::new()
                .large_image(img_url)
                .small_image("miles-logo-master")
                .small_text("Miles Music Player")
        } else {
            activity::Assets::new()
                .large_image("miles-logo-master")
                .large_text("Miles Music Player")
        };

        let mut act = activity::Activity::new()
            .activity_type(activity::ActivityType::Listening)
            .details(input.title);

        if !state_text.is_empty() {
            act = act.state(&state_text);
        }

        act = act.assets(assets);

        if input.is_playing && input.duration > 0 {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let start = now.saturating_sub(input.current_time as i64);
            let end = start.saturating_add(input.duration as i64);
            act = act.timestamps(activity::Timestamps::new().start(start).end(end));
        }

        if let Err(e) = client.set_activity(act) {
            // Reconnection fallback on IPC failure
            if let Some(mut old_client) = self.client.take() {
                let _ = old_client.close();
            }
            return Err(format!("Failed to set activity: {}", e));
        }

        Ok(())
    }

    pub fn clear_activity(&mut self) {
        if let Some(client) = self.client.as_mut() {
            let _ = client.clear_activity();
        }
    }
}

impl Default for DiscordRpcState {
    fn default() -> Self {
        Self::new()
    }
}

pub static DISCORD_RPC: Lazy<Mutex<DiscordRpcState>> =
    Lazy::new(|| Mutex::new(DiscordRpcState::new()));

use once_cell::sync::Lazy;

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn set_discord_activity(
    title: String,
    artist: String,
    cover_url: Option<String>,
    is_playing: bool,
    current_time: u64,
    duration: u64,
    enabled: bool,
    client_id: Option<String>,
) -> Result<(), String> {
    let mut rpc = DISCORD_RPC
        .lock()
        .map_err(|_| "Failed to lock Discord RPC mutex")?;
    if !enabled {
        rpc.clear_activity();
        return Ok(());
    }

    rpc.update_activity(DiscordActivityInput {
        title: &title,
        artist: &artist,
        cover_url: cover_url.as_deref(),
        is_playing,
        current_time,
        duration,
        client_id: client_id.as_deref(),
    })
}

#[tauri::command]
pub fn clear_discord_activity() -> Result<(), String> {
    let mut rpc = DISCORD_RPC
        .lock()
        .map_err(|_| "Failed to lock Discord RPC mutex")?;
    rpc.clear_activity();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{valid_client_id, valid_cover_url};

    #[test]
    fn accepts_only_snowflake_client_ids() {
        assert!(valid_client_id("1534752337543954512"));
        assert!(valid_client_id("  1534752337543954512  "));
        assert!(!valid_client_id(""));
        assert!(!valid_client_id("short"));
        assert!(!valid_client_id("1534752337543954512!"));
        assert!(!valid_client_id("../../etc/passwd"));
    }

    #[test]
    fn accepts_only_allowlisted_https_covers() {
        assert!(valid_cover_url("https://i.scdn.co/image/abc"));
        assert!(valid_cover_url(
            "https://i.ytimg.com/vi/abc/maxresdefault.jpg"
        ));
        assert!(valid_cover_url(
            "https://images.unsplash.com/photo-123?w=600"
        ));
        assert!(valid_cover_url("https://a.i.ytimg.com/x.jpg"));
        assert!(!valid_cover_url("http://i.scdn.co/image/abc"));
        assert!(!valid_cover_url("https://evil.test/i.scdn.co/x.jpg"));
        assert!(!valid_cover_url("https://i.scdn.co.evil.test/x.jpg"));
        assert!(!valid_cover_url("https://user@i.scdn.co/x.jpg"));
        assert!(!valid_cover_url("https://i.scdn.co:444/x.jpg"));
        assert!(!valid_cover_url("asset://localhost/covers/x.png"));
    }
}
