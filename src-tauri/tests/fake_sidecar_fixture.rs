use serde_json::Value;
use std::path::PathBuf;
use std::process::{Command, Output};

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("fake-sidecar.mjs")
}

fn run_fixture(scenario: &str) -> Output {
    Command::new("node")
        .arg(fixture_script())
        .arg(scenario)
        .output()
        .expect("Node.js must be available for fake-sidecar integration tests")
}

#[test]
fn emits_playlist_json_without_network_access() {
    let output = run_fixture("playlist-success");
    let payload: Value = serde_json::from_slice(&output.stdout).expect("valid playlist fixture");

    assert!(output.status.success());
    assert_eq!(payload["_type"], "playlist");
    assert_eq!(payload["entries"].as_array().map(Vec::len), Some(2));
}

#[test]
fn emits_track_json_with_direct_stream_fixture() {
    let output = run_fixture("track-success");
    let payload: Value = serde_json::from_slice(&output.stdout).expect("valid track fixture");

    assert!(output.status.success());
    assert_eq!(payload["id"], "dQw4w9WgXcQ");
    assert_eq!(payload["ext"], "m4a");
    assert!(payload["url"]
        .as_str()
        .is_some_and(|url| url.contains("expire=")));
}

#[test]
fn exposes_malformed_and_error_scenarios() {
    let malformed = run_fixture("malformed");
    let failed = run_fixture("exit-error");

    assert!(serde_json::from_slice::<Value>(&malformed.stdout).is_err());
    assert_eq!(failed.status.code(), Some(23));
    assert!(String::from_utf8_lossy(&failed.stderr).contains("extractor failure"));
}
