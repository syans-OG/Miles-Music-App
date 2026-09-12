use lofty::file::{AudioFile, FileType, TaggedFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Window};

pub mod discord_rpc;
mod media_proxy;
mod sidecar_manifest;
pub mod spotify;
pub mod youtube;

const MAX_LOCAL_AUDIO_FILE_BYTES: usize = 128 * 1024 * 1024;

#[cfg(not(target_os = "windows"))]
use tauri::LogicalSize;

#[cfg(target_os = "windows")]
use windows::Win32::UI::WindowsAndMessaging::{SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedAudioMetadata {
    file_path: String,
    file_hash: String,
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: u64,
    cover_path: Option<String>,
}

fn pixels_are_similar(pixel: &image::Rgba<u8>, background: &[u8; 3]) -> bool {
    pixel[3] < 16 || (0..3).all(|channel| pixel[channel].abs_diff(background[channel]) <= 22)
}

pub(crate) fn normalize_embedded_cover(data: &[u8]) -> Option<Vec<u8>> {
    const MAX_COVER_DIM: u32 = 1024;
    let decoded = image::load_from_memory(data).ok()?;
    let source = if decoded.width() > MAX_COVER_DIM || decoded.height() > MAX_COVER_DIM {
        decoded.thumbnail(MAX_COVER_DIM, MAX_COVER_DIM)
    } else {
        decoded
    }
    .to_rgba8();
    let (width, height) = source.dimensions();
    if width < 8 || height < 8 {
        return None;
    }

    let corners = [
        source.get_pixel(0, 0),
        source.get_pixel(width - 1, 0),
        source.get_pixel(0, height - 1),
        source.get_pixel(width - 1, height - 1),
    ];
    let background = [
        (corners.iter().map(|pixel| u32::from(pixel[0])).sum::<u32>() / 4) as u8,
        (corners.iter().map(|pixel| u32::from(pixel[1])).sum::<u32>() / 4) as u8,
        (corners.iter().map(|pixel| u32::from(pixel[2])).sum::<u32>() / 4) as u8,
    ];

    let row_is_blank = |y: u32| {
        let similar = (0..width)
            .filter(|&x| pixels_are_similar(source.get_pixel(x, y), &background))
            .count() as u32;
        similar * 100 >= width * 97
    };
    let column_is_blank = |x: u32| {
        let similar = (0..height)
            .filter(|&y| pixels_are_similar(source.get_pixel(x, y), &background))
            .count() as u32;
        similar * 100 >= height * 97
    };

    let mut top = 0;
    while top < height / 2 && row_is_blank(top) {
        top += 1;
    }
    let mut bottom = height;
    while bottom > top + 1 && row_is_blank(bottom - 1) {
        bottom -= 1;
    }
    let mut left = 0;
    while left < width / 2 && column_is_blank(left) {
        left += 1;
    }
    let mut right = width;
    while right > left + 1 && column_is_blank(right - 1) {
        right -= 1;
    }

    // Only remove meaningful letterboxing, not tiny compression variations.
    if top + (height - bottom) < height / 20 {
        top = 0;
        bottom = height;
    }
    if left + (width - right) < width / 20 {
        left = 0;
        right = width;
    }

    let content_width = right.saturating_sub(left);
    let content_height = bottom.saturating_sub(top);
    if content_width < width / 3 || content_height < height / 3 {
        left = 0;
        top = 0;
        right = width;
        bottom = height;
    }

    let content_width = right - left;
    let content_height = bottom - top;
    let square_size = content_width.min(content_height);
    let overscan = (square_size / 30).max(1);
    let final_size = square_size.saturating_sub(overscan * 2).max(1);
    let crop_x = left + (content_width - square_size) / 2 + overscan;
    let crop_y = top + (content_height - square_size) / 2 + overscan;
    let square =
        image::imageops::crop_imm(&source, crop_x, crop_y, final_size, final_size).to_image();

    let mut encoded = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(square)
        .write_to(&mut encoded, image::ImageFormat::Png)
        .ok()?;
    Some(encoded.into_inner())
}

fn validate_audio_size(size: usize) -> Result<(), String> {
    if size > MAX_LOCAL_AUDIO_FILE_BYTES {
        Err("Audio file size exceeds the 128 MB limit".to_string())
    } else {
        Ok(())
    }
}

fn file_type_matches_extension(file_type: FileType, extension: &str) -> bool {
    match extension {
        "mp3" => file_type == FileType::Mpeg,
        "wav" => file_type == FileType::Wav,
        "flac" => file_type == FileType::Flac,
        "m4a" => file_type == FileType::Mp4,
        "aac" => file_type == FileType::Aac,
        "ogg" => matches!(
            file_type,
            FileType::Vorbis | FileType::Opus | FileType::Speex
        ),
        _ => false,
    }
}

fn parse_audio_payload(bytes: &[u8], extension: &str) -> Result<TaggedFile, String> {
    validate_audio_size(bytes.len())?;
    let probe = Probe::new(Cursor::new(bytes))
        .guess_file_type()
        .map_err(|_| "Audio file content could not be recognized".to_string())?;
    let file_type = probe
        .file_type()
        .filter(|file_type| file_type_matches_extension(*file_type, extension))
        .ok_or_else(|| "File content does not match the audio format".to_string())?;
    debug_assert!(file_type_matches_extension(file_type, extension));
    probe
        .read()
        .map_err(|_| "Audio file is corrupted or unsupported".to_string())
}

#[tauri::command]
async fn save_imported_audio(
    app_handle: AppHandle,
    request: Request<'_>,
) -> Result<ImportedAudioMetadata, String> {
    let file_name = request
        .headers()
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "Audio file name not found".to_string())?;

    let safe_name: String = file_name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();

    let source_path = Path::new(&safe_name);
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "Audio file must have an extension".to_string())?;

    if !matches!(
        extension.as_str(),
        "mp3" | "wav" | "flac" | "m4a" | "aac" | "ogg"
    ) {
        return Err(format!("Audio format .{extension} is not supported"));
    }

    let library_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|error| {
            log::warn!("save_imported_audio_library_dir_failed err={error}");
            "Could not access music library".to_string()
        })?
        .join("library");
    std::fs::create_dir_all(&library_dir).map_err(|error| {
        log::warn!("save_imported_audio_create_dir_failed err={error}");
        "Could not access music library".to_string()
    })?;

    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Audio file payload is invalid".to_string());
    };
    let tagged_file = parse_audio_payload(bytes, &extension)?;

    let file_hash = format!("{:x}", Sha256::digest(bytes));
    let destination = library_dir.join(format!("{file_hash}.{extension}"));
    if !destination.exists() {
        std::fs::write(&destination, bytes).map_err(|error| {
            log::warn!("save_imported_audio_write_failed err={error}");
            "Could not save audio file".to_string()
        })?;
    }

    let mut metadata = ImportedAudioMetadata {
        file_path: destination.to_string_lossy().into_owned(),
        file_hash: file_hash.clone(),
        title: None,
        artist: None,
        album: None,
        duration: 0,
        cover_path: None,
    };

    metadata.duration = tagged_file.properties().duration().as_secs();

    if let Some(tag) = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())
    {
        metadata.title = tag
            .title()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        metadata.artist = tag
            .artist()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        metadata.album = tag
            .album()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        if let Some(picture) = tag.pictures().first() {
            if let Some(normalized_cover) = normalize_embedded_cover(picture.data()) {
                let covers_dir = library_dir.join("covers");
                let cover_destination = covers_dir.join(format!("{file_hash}.png"));
                if cover_destination.exists() {
                    metadata.cover_path = Some(cover_destination.to_string_lossy().into_owned());
                } else {
                    match std::fs::create_dir_all(&covers_dir)
                        .and_then(|_| std::fs::write(&cover_destination, normalized_cover))
                    {
                        Ok(()) => {
                            metadata.cover_path =
                                Some(cover_destination.to_string_lossy().into_owned());
                        }
                        Err(error) => {
                            log::warn!(
                                "local_import_cover_write_failed file={file_hash}.png err={error}"
                            );
                        }
                    }
                }
            }
        }
    }

    Ok(metadata)
}

#[cfg(test)]
mod local_audio_tests {
    use super::*;

    #[test]
    fn accepts_55_mb_and_rejects_payloads_above_128_mb() {
        assert!(validate_audio_size(55 * 1024 * 1024).is_ok());
        assert!(validate_audio_size(MAX_LOCAL_AUDIO_FILE_BYTES).is_ok());
        assert!(validate_audio_size(MAX_LOCAL_AUDIO_FILE_BYTES + 1).is_err());
    }

    #[test]
    fn rejects_non_audio_payloads_before_writing_to_disk() {
        assert!(parse_audio_payload(b"not an audio file", "mp3").is_err());
    }
}

fn remove_managed_file(library_dir: &Path, file_path: Option<String>) -> Result<(), String> {
    let Some(file_path) = file_path.filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let candidate = PathBuf::from(file_path);
    if !candidate.exists() {
        return Ok(());
    }

    let canonical_library = std::fs::canonicalize(library_dir).map_err(|error| {
        log::warn!("remove_managed_file_canonicalize_library_failed err={error}");
        "Could not verify library file".to_string()
    })?;
    let canonical_candidate = std::fs::canonicalize(&candidate).map_err(|error| {
        log::warn!("remove_managed_file_canonicalize_candidate_failed err={error}");
        "Could not verify library file".to_string()
    })?;
    if !canonical_candidate.starts_with(&canonical_library) || !canonical_candidate.is_file() {
        return Err("File is outside the application library".to_string());
    }

    std::fs::remove_file(canonical_candidate).map_err(|error| {
        log::warn!("remove_managed_file_delete_failed err={error}");
        "Could not delete library file".to_string()
    })
}

#[tauri::command]
async fn delete_library_song(
    app_handle: AppHandle,
    file_path: Option<String>,
    cover_path: Option<String>,
) -> Result<(), String> {
    let library_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|error| {
            log::warn!("delete_library_song_library_dir_failed err={error}");
            "Could not access music library".to_string()
        })?
        .join("library");

    remove_managed_file(&library_dir, file_path)?;
    remove_managed_file(&library_dir, cover_path)
}

#[tauri::command]
async fn resize_widget_window(
    window: Window,
    width: f64,
    height: f64,
    dock_position: String,
) -> Result<(), String> {
    let factor = window.scale_factor().unwrap_or(1.0);
    let target_w = (width * factor).round();
    let target_h = (height * factor).round();

    let current_size = window
        .outer_size()
        .map_err(|error| format!("resize_widget_window outer_size failed: {error}"))?;
    let current_pos = window
        .outer_position()
        .map_err(|error| format!("resize_widget_window outer_position failed: {error}"))?;

    let start_w = current_size.width as f64;
    let start_h = current_size.height as f64;
    let start_x = current_pos.x as f64;
    let start_y = current_pos.y as f64;

    let mut end_x;
    let mut end_y;

    // 1. Dynamic Anchor (menyesut/expanding) based on relative position on screen
    if let Ok(Some(monitor)) = window.current_monitor() {
        let mon_w = monitor.size().width as f64;
        let mon_h = monitor.size().height as f64;
        let mon_x = monitor.position().x as f64;
        let mon_y = monitor.position().y as f64;

        let win_center_x = start_x + start_w / 2.0;
        let win_center_y = start_y + start_h / 2.0;

        let rel_x = win_center_x - mon_x;
        let rel_y = win_center_y - mon_y;

        // Anchor X (Kiri, Tengah, Kanan)
        if rel_x < mon_w / 3.0 {
            end_x = start_x; // Anchor kiri
        } else if rel_x > mon_w * 2.0 / 3.0 {
            end_x = start_x + start_w - target_w; // Anchor kanan
        } else {
            end_x = start_x + (start_w - target_w) / 2.0; // Anchor tengah
        }

        // Anchor Y (Atas, Tengah, Bawah)
        if rel_y < mon_h / 3.0 {
            end_y = start_y; // Anchor atas
        } else if rel_y > mon_h * 2.0 / 3.0 {
            end_y = start_y + start_h - target_h; // Anchor bawah
        } else {
            end_y = start_y + (start_h - target_h) / 2.0; // Anchor tengah
        }
    } else {
        // Fallback anchor tengah
        end_x = start_x + (start_w - target_w) / 2.0;
        end_y = start_y + (start_h - target_h) / 2.0;
    }

    // 2. Override for exact Snap Position (if not free)
    if dock_position != "free" {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let monitor_pos = monitor.position();
            let monitor_size = monitor.size();

            let margin_x = (8.0 * factor).round();
            let margin_y = (8.0 * factor).round();
            let taskbar_bottom = (40.0 * factor).round();

            match dock_position.as_str() {
                "top-left" | "bottom-left" => end_x = monitor_pos.x as f64 + margin_x,
                "top-right" | "bottom-right" => {
                    end_x = monitor_pos.x as f64 + monitor_size.width as f64 - target_w - margin_x
                }
                _ => {}
            };

            match dock_position.as_str() {
                "top-left" | "top-right" => end_y = monitor_pos.y as f64 + margin_y,
                "bottom-left" | "bottom-right" => {
                    end_y = monitor_pos.y as f64 + monitor_size.height as f64
                        - target_h
                        - margin_y
                        - taskbar_bottom
                }
                _ => {}
            };
        }
    }

    let target_x = end_x.round() as i32;
    let target_y = end_y.round() as i32;

    // Update the complete bounds atomically. Backdrop-filter is intentionally
    // avoided in the frontend so DWM can reuse the transparent WebView surface
    // while its origin changes.
    #[cfg(target_os = "windows")]
    {
        let hwnd = window.hwnd().map_err(|error| error.to_string())?;

        unsafe {
            SetWindowPos(
                hwnd,
                None,
                target_x,
                target_y,
                target_w.round() as i32,
                target_h.round() as i32,
                SWP_NOACTIVATE | SWP_NOZORDER,
            )
            .map_err(|error| error.to_string())?;
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let target_pos = PhysicalPosition::new(target_x, target_y);
        let target_size = LogicalSize::new(width, height);

        if end_x > start_x || end_y > start_y {
            // Anchored right/bottom: Set position first to keep right/bottom edge aligned, then trim size
            window
                .set_position(target_pos)
                .map_err(|error| format!("resize_widget_window set_position failed: {error}"))?;
            window
                .set_size(target_size)
                .map_err(|error| format!("resize_widget_window set_size failed: {error}"))?;
        } else {
            // Anchored left/top: Set size first, then fine-tune position
            window
                .set_size(target_size)
                .map_err(|error| format!("resize_widget_window set_size failed: {error}"))?;
            window
                .set_position(target_pos)
                .map_err(|error| format!("resize_widget_window set_position failed: {error}"))?;
        }

        Ok(())
    }
}

#[tauri::command]
async fn handle_drag_end_snap(window: Window) -> Result<String, String> {
    if let (Ok(pos), Ok(size), Ok(Some(monitor))) = (
        window.outer_position(),
        window.outer_size(),
        window.current_monitor(),
    ) {
        let factor = window.scale_factor().unwrap_or(1.0);
        let physical_w = size.width as i32;
        let physical_h = size.height as i32;

        let mon_x = monitor.position().x;
        let mon_y = monitor.position().y;
        let mon_w = monitor.size().width as i32;
        let mon_h = monitor.size().height as i32;

        let margin = (8.0 * factor).round() as i32;
        let taskbar_b = (40.0 * factor).round() as i32;

        let snap_corners = [
            ("top-left", mon_x + margin, mon_y + margin),
            (
                "top-right",
                mon_x + mon_w - physical_w - margin,
                mon_y + margin,
            ),
            (
                "bottom-left",
                mon_x + margin,
                mon_y + mon_h - physical_h - margin - taskbar_b,
            ),
            (
                "bottom-right",
                mon_x + mon_w - physical_w - margin,
                mon_y + mon_h - physical_h - margin - taskbar_b,
            ),
        ];

        let current_x = pos.x;
        let current_y = pos.y;

        // Magnetic threshold: 140px radius
        let threshold = (140.0 * factor).round();
        let mut closest_corner: Option<(&str, i32, i32)> = None;
        let mut min_dist = f64::MAX;

        for (name, target_x, target_y) in snap_corners {
            let dx = (current_x - target_x) as f64;
            let dy = (current_y - target_y) as f64;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist < min_dist && dist <= threshold {
                min_dist = dist;
                closest_corner = Some((name, target_x, target_y));
            }
        }

        if let Some((corner_name, target_x, target_y)) = closest_corner {
            // Smooth animation loop
            let steps = 20;
            let duration_ms = 150;
            let sleep_ms = duration_ms / steps;

            let start_x = current_x as f64;
            let start_y = current_y as f64;
            let end_x = target_x as f64;
            let end_y = target_y as f64;

            for i in 1..=steps {
                // Simple ease-out cubic interpolation: 1 - (1 - t)^3
                let t = i as f64 / steps as f64;
                let ease_out = 1.0 - (1.0 - t).powi(3);

                let cur_x = start_x + (end_x - start_x) * ease_out;
                let cur_y = start_y + (end_y - start_y) * ease_out;

                let _ = window.set_position(PhysicalPosition::new(
                    cur_x.round() as i32,
                    cur_y.round() as i32,
                ));

                std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
            }

            // Ensure final exact position
            match window.set_position(PhysicalPosition::new(target_x, target_y)) {
                Ok(()) => Ok(corner_name.to_string()),
                Err(error) => {
                    log::warn!("handle_drag_end_snap_final_set_position_failed corner={corner_name} err={error}");
                    Ok("free".to_string())
                }
            }
        } else {
            Ok("free".to_string())
        }
    } else {
        Ok("free".to_string())
    }
}

#[tauri::command]
async fn detect_dock_position(window: Window) -> Result<String, String> {
    handle_drag_end_snap(window).await
}

#[tauri::command]
fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_window(window: Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let media_proxy = media_proxy::MediaProxy::start().expect("audio proxy could not start");
    let application = tauri::Builder::default()
        .manage(youtube::commands::YoutubeCommandService::default())
        .manage(media_proxy)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
                let _ = window.emit("single-instance-focus", ());
            }
        }))
        .setup(|app| {
            let header_item =
                MenuItem::with_id(app, "header", "🎵 Miles v1.0.7", false, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;

            let play_pause_item =
                MenuItem::with_id(app, "play_pause", "⏯️ Play / Pause", true, None::<&str>)?;
            let next_item = MenuItem::with_id(app, "next", "⏭️ Next Track", true, None::<&str>)?;
            let prev_item = MenuItem::with_id(app, "prev", "⏮️ Prev Track", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;

            // Submenu: Player Mode
            let mode1_item =
                MenuItem::with_id(app, "mode_1", "🎚️ Console Bar", true, None::<&str>)?;
            let mode2_item = MenuItem::with_id(app, "mode_2", "💿 Turntable", true, None::<&str>)?;
            let mode3_item = MenuItem::with_id(app, "mode_3", "🫧 Bubble", true, None::<&str>)?;
            let mode_submenu = Submenu::with_items(
                app,
                "🎛️ Player Mode",
                true,
                &[&mode1_item, &mode2_item, &mode3_item],
            )?;

            // Submenu: Playback / Queue
            let loop_item =
                MenuItem::with_id(app, "toggle_loop", "🔂 Loop Track", true, None::<&str>)?;
            let shuffle_item =
                MenuItem::with_id(app, "shuffle_queue", "🔀 Shuffle Queue", true, None::<&str>)?;
            let clear_queue_item =
                MenuItem::with_id(app, "clear_queue", "🗑️ Clear Queue", true, None::<&str>)?;
            let queue_submenu = Submenu::with_items(
                app,
                "🔁 Playback",
                true,
                &[&loop_item, &shuffle_item, &clear_queue_item],
            )?;

            let sep3 = PredefinedMenuItem::separator(app)?;

            let quit_item = MenuItem::with_id(app, "quit", "⏻ Exit Miles", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &header_item,
                    &sep1,
                    &play_pause_item,
                    &next_item,
                    &prev_item,
                    &sep2,
                    &mode_submenu,
                    &queue_submenu,
                    &sep3,
                    &quit_item,
                ],
            )?;

            let icon = app
                .default_window_icon()
                .cloned()
                .expect("default window icon missing");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("Miles Music Player")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "play_pause" => {
                        let _ = app.emit("tray-play-pause", ());
                    }
                    "next" => {
                        let _ = app.emit("tray-next-track", ());
                    }
                    "prev" => {
                        let _ = app.emit("tray-prev-track", ());
                    }
                    "mode_1" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("tray-set-mode", 1);
                    }
                    "mode_2" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("tray-set-mode", 2);
                    }
                    "mode_3" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("tray-set-mode", 3);
                    }
                    "toggle_loop" => {
                        let _ = app.emit("tray-toggle-loop", ());
                    }
                    "shuffle_queue" => {
                        let _ = app.emit("tray-shuffle-queue", ());
                    }
                    "clear_queue" => {
                        let _ = app.emit("tray-clear-queue", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            save_imported_audio,
            delete_library_song,
            resize_widget_window,
            handle_drag_end_snap,
            detect_dock_position,
            minimize_window,
            close_window,
            hide_window,
            youtube::dependencies::get_youtube_dependency_health,
            youtube::commands::import_youtube_playlist,
            youtube::commands::resolve_youtube_track,
            youtube::commands::cancel_youtube_import,
            youtube::commands::cancel_youtube_resolve,
            youtube::commands::match_spotify_track,
            youtube::commands::cancel_spotify_match,
            youtube::commands::download_youtube_track,
            youtube::commands::cancel_youtube_download,
            discord_rpc::set_discord_activity,
            discord_rpc::clear_discord_activity,
            spotify::fetch_spotify_playlist
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");
    application.run(|_, event| {
        if matches!(
            event,
            tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
        ) {
            youtube::process::terminate_all_active_processes();
        }
    });
}
