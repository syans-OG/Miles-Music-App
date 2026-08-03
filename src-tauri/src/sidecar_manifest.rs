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
