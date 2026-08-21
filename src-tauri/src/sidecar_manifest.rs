use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarManifest {
    pub schema_version: u8,
    pub target: String,
    pub binaries: Vec<SidecarBinary>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarBinary {
    pub id: String,
    pub version: String,
    pub download_url: String,
    pub publisher_asset_sha256: String,
    pub file_name: String,
    pub runtime_file_name: String,
    pub sha256: String,
}

const SUPPORTED_TARGETS: &[&str] = &[
    "x86_64-pc-windows-msvc",
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "x86_64-unknown-linux-gnu",
];

pub fn parse_manifest(contents: &str) -> Result<SidecarManifest, serde_json::Error> {
    serde_json::from_str(contents)
}

pub fn sha256_file(path: &Path) -> io::Result<String> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        let bytes_read = file.read(&mut buffer)?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn validate_for_target(manifest: &SidecarManifest, target: &str) -> Result<(), String> {
    if manifest.schema_version != 1 {
        return Err("Versi schema manifest sidecar tidak didukung".to_string());
    }
    if !SUPPORTED_TARGETS.contains(&target) || manifest.target != target {
        return Err(format!("Sidecar tidak tersedia untuk target {target}"));
    }
    if manifest.binaries.len() != 2 {
        return Err("Manifest harus berisi tepat dua sidecar".to_string());
    }

    let extension = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    for id in ["yt-dlp", "deno"] {
        let matching = manifest
            .binaries
            .iter()
            .filter(|binary| binary.id == id)
            .collect::<Vec<_>>();
        if matching.len() != 1 {
            return Err(format!("Manifest harus berisi tepat satu sidecar {id}"));
        }

        let binary = matching[0];
        let expected_file_name = format!("binaries/{id}-{target}{extension}");
        let expected_runtime_file_name = format!("{id}{extension}");
        let valid_hash =
            |value: &str| value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit());
        if binary.version.is_empty()
            || !binary.download_url.starts_with("https://github.com/")
            || !valid_hash(&binary.publisher_asset_sha256)
            || !valid_hash(&binary.sha256)
            || binary.file_name != expected_file_name
            || binary.runtime_file_name != expected_runtime_file_name
        {
            return Err(format!("Metadata sidecar {id} tidak valid untuk {target}"));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest_for(target: &str, extension: &str) -> SidecarManifest {
        let binary = |id: &str| SidecarBinary {
            id: id.to_string(),
            version: "1.0.0".to_string(),
            download_url: format!("https://github.com/example/{id}"),
            publisher_asset_sha256: "a".repeat(64),
            file_name: format!("binaries/{id}-{target}{extension}"),
            runtime_file_name: format!("{id}{extension}"),
            sha256: "b".repeat(64),
        };

        SidecarManifest {
            schema_version: 1,
            target: target.to_string(),
            binaries: vec![binary("yt-dlp"), binary("deno")],
        }
    }

    #[test]
    fn accepts_windows_and_unix_target_metadata() {
        let windows = manifest_for("x86_64-pc-windows-msvc", ".exe");
        let macos = manifest_for("aarch64-apple-darwin", "");
        let linux = manifest_for("x86_64-unknown-linux-gnu", "");

        assert!(validate_for_target(&windows, &windows.target).is_ok());
        assert!(validate_for_target(&macos, &macos.target).is_ok());
        assert!(validate_for_target(&linux, &linux.target).is_ok());
    }

    #[test]
    fn rejects_cross_target_and_windows_only_unix_names() {
        let windows = manifest_for("x86_64-pc-windows-msvc", ".exe");
        let unix_with_exe = manifest_for("x86_64-apple-darwin", ".exe");

        assert!(validate_for_target(&windows, "aarch64-apple-darwin").is_err());
        assert!(validate_for_target(&unix_with_exe, &unix_with_exe.target).is_err());
    }

    #[test]
    fn validates_every_pinned_platform_manifest() {
        let manifest_directory = Path::new(env!("CARGO_MANIFEST_DIR")).join("sidecars");

        for target in SUPPORTED_TARGETS {
            let contents =
                std::fs::read_to_string(manifest_directory.join(format!("{target}.json")))
                    .expect("supported target manifest should exist");
            let manifest =
                parse_manifest(&contents).expect("platform manifest should be valid JSON");

            validate_for_target(&manifest, target)
                .unwrap_or_else(|error| panic!("invalid manifest for {target}: {error}"));
        }
    }
}
