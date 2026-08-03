#[path = "src/sidecar_manifest.rs"]
mod sidecar_manifest;

use sidecar_manifest::{parse_manifest, sha256_file, SidecarManifest};
use std::path::Path;

const MANIFEST_PATH: &str = "sidecars.json";

fn main() {
    verify_sidecars().unwrap_or_else(|message| panic!("{message}"));
    tauri_build::build()
}

fn verify_sidecars() -> Result<(), String> {
    println!("cargo:rerun-if-changed={MANIFEST_PATH}");
    let contents = std::fs::read_to_string(MANIFEST_PATH)
        .map_err(|error| format!("Sidecar manifest tidak dapat dibaca: {error}"))?;
    let manifest = parse_manifest(&contents)
        .map_err(|error| format!("Sidecar manifest tidak valid: {error}"))?;
    validate_manifest(&manifest)?;

    for binary in &manifest.binaries {
        println!("cargo:rerun-if-changed={}", binary.file_name);
        let path = Path::new(&binary.file_name);
        let actual_hash = sha256_file(path)
            .map_err(|error| format!("Sidecar {} tidak dapat dibaca: {error}", binary.id))?;
        if !actual_hash.eq_ignore_ascii_case(&binary.sha256) {
            return Err(format!("Checksum sidecar {} tidak cocok", binary.id));
        }
    }

    Ok(())
}

fn validate_manifest(manifest: &SidecarManifest) -> Result<(), String> {
    let target = std::env::var("TARGET").map_err(|error| error.to_string())?;
    if manifest.schema_version != 1 || manifest.target != target {
        return Err(format!("Sidecar tidak tersedia untuk target {target}"));
    }
    if manifest.binaries.len() != 2 {
        return Err("Manifest harus berisi tepat dua sidecar".to_string());
    }

    for binary in &manifest.binaries {
        let has_valid_metadata = !binary.version.is_empty()
            && binary.download_url.starts_with("https://github.com/")
            && binary.publisher_asset_sha256.len() == 64
            && binary.sha256.len() == 64
            && binary.runtime_file_name.ends_with(".exe");
        if !has_valid_metadata {
            return Err(format!("Metadata sidecar {} tidak valid", binary.id));
        }
    }

    Ok(())
}
