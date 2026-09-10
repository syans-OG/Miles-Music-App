use crate::sidecar_manifest::{
    parse_manifest, sha256_file, validate_for_target, SidecarBinary, SidecarManifest,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

const SIDECAR_MANIFEST: &str = include_str!(env!("MILES_SIDECAR_MANIFEST"));
const BUILD_TARGET: &str = env!("MILES_TARGET");
static VERIFIED_SIDECARS: OnceLock<VerifiedSidecars> = OnceLock::new();

#[derive(Clone)]
pub struct VerifiedSidecars {
    pub yt_dlp: PathBuf,
    pub deno: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyHealth {
    available: bool,
    yt_dlp_version: String,
    deno_version: String,
    issue: Option<DependencyIssue>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DependencyIssue {
    code: &'static str,
    message: String,
}

#[derive(Debug)]
struct VerificationError {
    code: &'static str,
    message: String,
}

pub fn verify_runtime_sidecars() -> Result<&'static VerifiedSidecars, String> {
    if let Some(sidecars) = VERIFIED_SIDECARS.get() {
        return Ok(sidecars);
    }

    let manifest = load_manifest().map_err(|error| error.message)?;
    let sidecars = verify_manifest_binaries(&manifest).map_err(|error| error.message)?;
    let _ = VERIFIED_SIDECARS.set(sidecars);
    VERIFIED_SIDECARS
        .get()
        .ok_or_else(|| "Verifikasi dependency tidak dapat disimpan".to_string())
}

#[tauri::command]
pub async fn get_youtube_dependency_health() -> DependencyHealth {
    tauri::async_runtime::spawn_blocking(build_dependency_health)
        .await
        .unwrap_or_else(|_| {
            unavailable_health("verification_failed", "Verifikasi dependency gagal")
        })
}

fn build_dependency_health() -> DependencyHealth {
    let manifest = match load_manifest() {
        Ok(manifest) => manifest,
        Err(error) => return unavailable_health(error.code, &error.message),
    };
    let (yt_dlp_version, deno_version) = manifest_versions(&manifest);

    match verify_runtime_sidecars() {
        Ok(sidecars) if sidecars.yt_dlp.is_file() && sidecars.deno.is_file() => DependencyHealth {
            available: true,
            yt_dlp_version,
            deno_version,
            issue: None,
        },
        Ok(_) => unavailable_health(
            "dependency_unavailable",
            "Dependency YouTube tidak lagi tersedia",
        ),
        Err(message) => DependencyHealth {
            available: false,
            yt_dlp_version,
            deno_version,
            issue: Some(DependencyIssue {
                code: "dependency_unavailable",
                message,
            }),
        },
    }
}

fn load_manifest() -> Result<SidecarManifest, VerificationError> {
    let manifest = parse_manifest(SIDECAR_MANIFEST).map_err(|_| VerificationError {
        code: "invalid_manifest",
        message: "Manifest dependency YouTube tidak valid".to_string(),
    })?;

    if validate_for_target(&manifest, BUILD_TARGET).is_err() {
        return Err(VerificationError {
            code: "invalid_manifest",
            message: "Manifest dependency YouTube tidak didukung".to_string(),
        });
    }

    Ok(manifest)
}

fn verify_manifest_binaries(
    manifest: &SidecarManifest,
) -> Result<VerifiedSidecars, VerificationError> {
    let yt_dlp = find_and_verify(manifest, "yt-dlp")?;
    let deno = find_and_verify(manifest, "deno")?;
    Ok(VerifiedSidecars { yt_dlp, deno })
}

fn find_and_verify(
    manifest: &SidecarManifest,
    binary_id: &'static str,
) -> Result<PathBuf, VerificationError> {
    let binary = manifest
        .binaries
        .iter()
        .find(|binary| binary.id == binary_id)
        .ok_or_else(|| VerificationError {
            code: "invalid_manifest",
            message: format!("Dependency {binary_id} tidak terdaftar"),
        })?;
    let path = resolve_binary_path(binary).ok_or_else(|| VerificationError {
        code: "missing_binary",
        message: format!("Dependency {} tidak ditemukan", binary.id),
    })?;
    verify_binary_hash(binary, &path)?;
    Ok(path)
}

fn verify_binary_hash(binary: &SidecarBinary, path: &Path) -> Result<(), VerificationError> {
    let actual_hash = sha256_file(path).map_err(|_| VerificationError {
        code: "unreadable_binary",
        message: format!("Dependency {} tidak dapat diperiksa", binary.id),
    })?;

    if !actual_hash.eq_ignore_ascii_case(&binary.sha256) {
        return Err(VerificationError {
            code: "checksum_mismatch",
            message: format!("Integritas dependency {} tidak valid", binary.id),
        });
    }

    Ok(())
}

fn resolve_binary_path(binary: &SidecarBinary) -> Option<PathBuf> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let mut candidates = vec![manifest_dir.join(&binary.file_name)];

    if let Ok(executable) = std::env::current_exe() {
        if let Some(directory) = executable.parent() {
            candidates.push(directory.join(&binary.runtime_file_name));
            candidates
                .push(directory.join(Path::new(&binary.file_name).file_name().unwrap_or_default()));
        }
    }

    candidates.into_iter().find(|path| path.is_file())
}

fn manifest_versions(manifest: &SidecarManifest) -> (String, String) {
    let version = |id: &str| {
        manifest
            .binaries
            .iter()
            .find(|binary| binary.id == id)
            .map(|binary| binary.version.clone())
            .unwrap_or_default()
    };
    (version("yt-dlp"), version("deno"))
}

fn unavailable_health(code: &'static str, message: &str) -> DependencyHealth {
    DependencyHealth {
        available: false,
        yt_dlp_version: String::new(),
        deno_version: String::new(),
        issue: Some(DependencyIssue {
            code,
            message: message.to_string(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn reports_healthy_pinned_sidecars() {
        let health = build_dependency_health();

        assert!(health.available);
        assert_eq!(health.yt_dlp_version, "2026.08.19");
        assert_eq!(health.deno_version, "2.9.4");
        assert!(health.issue.is_none());
    }

    #[test]
    fn rejects_tampered_binary_content() {
        let manifest = load_manifest().expect("manifest should be valid");
        let binary = manifest
            .binaries
            .first()
            .expect("manifest should contain yt-dlp");
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("miles-tampered-{unique}.exe"));
        std::fs::write(&path, b"tampered").expect("fixture should be writable");

        let error = verify_binary_hash(binary, &path).expect_err("tampering must be rejected");
        let _ = std::fs::remove_file(path);

        assert_eq!(error.code, "checksum_mismatch");
    }
}
