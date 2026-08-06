use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_CLIENT_ID: &str = "1534752337543954512";

pub struct DiscordRpcState {
    client: Option<DiscordIpcClient>,
    current_client_id: String,
}

impl DiscordRpcState {
    pub fn new() -> Self {
        Self {
            client: None,
            current_client_id: DEFAULT_CLIENT_ID.to_string(),
        }
    }

    fn ensure_connected(&mut self, client_id: Option<&str>) -> Result<&mut DiscordIpcClient, String> {
        let target_id = client_id.unwrap_or(DEFAULT_CLIENT_ID).trim();
        let target_id = if target_id.is_empty() { DEFAULT_CLIENT_ID } else { target_id };

        if self.current_client_id != target_id {
            if let Some(mut client) = self.client.take() {
                let _ = client.close();
            }
            self.current_client_id = target_id.to_string();
        }

        if self.client.is_none() {
            let mut client = DiscordIpcClient::new(&self.current_client_id)
                .map_err(|e| format!("Failed to create Discord client: {}", e))?;
            client.connect().map_err(|e| format!("Failed to connect to Discord: {}", e))?;
            self.client = Some(client);
        }

        Ok(self.client.as_mut().unwrap())
    }

    pub fn update_activity(
        &mut self,
        title: &str,
        artist: &str,
        is_playing: bool,
        current_time: u64,
        duration: u64,
        client_id: Option<&str>,
    ) -> Result<(), String> {
        let client = match self.ensure_connected(client_id) {
            Ok(c) => c,
            Err(err) => return Err(err),
        };

        let state_text = if artist.trim().is_empty() {
            "Miles Music Player".to_string()
        } else {
            format!("oleh {}", artist)
        };

        let mut assets = activity::Assets::new()
            .large_image("miles_logo")
            .large_text("Miles Music Player");

        if is_playing {
            assets = assets.small_image("play").small_text("Memutar");
        } else {
            assets = assets.small_image("pause").small_text("Di-pause");
        }

        let mut act = activity::Activity::new()
            .details(title)
            .state(&state_text)
            .assets(assets);

        if is_playing && duration > 0 {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64;
            let start = now.saturating_sub(current_time as i64);
            let end = start.saturating_add(duration as i64);
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

pub static DISCORD_RPC: Lazy<Mutex<DiscordRpcState>> = Lazy::new(|| Mutex::new(DiscordRpcState::new()));

use once_cell::sync::Lazy;

#[tauri::command]
pub fn set_discord_activity(
    title: String,
    artist: String,
    is_playing: bool,
    current_time: u64,
    duration: u64,
    enabled: bool,
    client_id: Option<String>,
) -> Result<(), String> {
    let mut rpc = DISCORD_RPC.lock().map_err(|_| "Failed to lock Discord RPC mutex")?;
    if !enabled {
        rpc.clear_activity();
        return Ok(());
    }

    rpc.update_activity(
        &title,
        &artist,
        is_playing,
        current_time,
        duration,
        client_id.as_deref(),
    )
}

#[tauri::command]
pub fn clear_discord_activity() -> Result<(), String> {
    let mut rpc = DISCORD_RPC.lock().map_err(|_| "Failed to lock Discord RPC mutex")?;
    rpc.clear_activity();
    Ok(())
}
