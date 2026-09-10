#[path = "src/sidecar_manifest.rs"]
mod sidecar_manifest;

use sidecar_manifest::{parse_manifest, sha256_file, validate_for_target};
use std::path::{Path, PathBuf};

fn main() {
    verify_sidecars().unwrap_or_else(|message| panic!("{message}"));
    tauri_build::build()
}

fn verify_sidecars() -> Result<(), String> {
    println!("cargo:rerun-if-env-changed=TARGET");
    let target = std::env::var("TARGET").map_err(|error| error.to_string())?;
    let manifest_path = PathBuf::from(format!("sidecars/{target}.json"));
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let contents = std::fs::read_to_string(&manifest_path)
        .map_err(|error| format!("Sidecar manifest could not be read: {error}"))?;
    let manifest = parse_manifest(&contents)
        .map_err(|error| format!("Sidecar manifest is invalid: {error}"))?;
    validate_for_target(&manifest, &target)?;
    let absolute_manifest_path = std::fs::canonicalize(&manifest_path)
        .map_err(|error| format!("Sidecar manifest path is invalid: {error}"))?;
    println!("cargo:rustc-env=MILES_TARGET={target}");
    println!(
        "cargo:rustc-env=MILES_SIDECAR_MANIFEST={}",
        absolute_manifest_path.display()
    );

    for binary in &manifest.binaries {
        println!("cargo:rerun-if-changed={}", binary.file_name);
        let path = Path::new(&binary.file_name);
        let actual_hash = sha256_file(path)
            .map_err(|error| format!("Sidecar {} could not be read: {error}", binary.id))?;
        if !actual_hash.eq_ignore_ascii_case(&binary.sha256) {
            return Err(format!("Checksum for sidecar {} does not match", binary.id));
        }
    }

    Ok(())
}
