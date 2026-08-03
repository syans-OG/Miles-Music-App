use miles_music_player_lib::youtube::process::{
    CancellationToken, OperationKind, ProcessErrorKind, ProcessRequest, ProcessRunner,
};
use std::ffi::OsString;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn fixture_script() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join("fake-sidecar.mjs")
}

fn request(scenario: &str, additional: &[OsString]) -> ProcessRequest {
    let mut arguments = vec![fixture_script().into_os_string(), OsString::from(scenario)];
    arguments.extend_from_slice(additional);
    ProcessRequest {
        program: PathBuf::from("node"),
        arguments,
        operation: OperationKind::Resolve,
    }
}

fn unique_temp_file(label: &str) -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock should be valid")
        .as_nanos();
    std::env::temp_dir().join(format!("miles-{label}-{unique}.tmp"))
}

#[test]
fn captures_successful_bounded_output() {
    let output = ProcessRunner::with_limits(Duration::from_secs(2), 1024 * 1024)
        .run(request("track-success", &[]), &CancellationToken::default())
        .expect("fixture should succeed");

    assert!(output.status.success());
    assert!(serde_json::from_slice::<serde_json::Value>(&output.stdout).is_ok());
}

#[test]
fn rejects_oversized_output_and_terminates_process() {
    let error = ProcessRunner::with_limits(Duration::from_secs(2), 64 * 1024)
        .run(request("oversized", &[]), &CancellationToken::default())
        .expect_err("oversized output must fail");

    assert_eq!(error.kind, ProcessErrorKind::OutputTooLarge);
}

#[test]
fn times_out_and_cancels_processes() {
    let runner = ProcessRunner::with_limits(Duration::from_millis(300), 1024 * 1024);
    let timeout = runner
        .run(request("timeout", &[]), &CancellationToken::default())
        .expect_err("fixture must time out");
    assert_eq!(timeout.kind, ProcessErrorKind::Timeout);

    let cancellation = CancellationToken::default();
    let cancellation_signal = cancellation.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(100));
        cancellation_signal.cancel();
    });
    let cancelled = ProcessRunner::with_limits(Duration::from_secs(2), 1024 * 1024)
        .run(request("timeout", &[]), &cancellation)
        .expect_err("fixture must be cancelled");
    assert_eq!(cancelled.kind, ProcessErrorKind::Cancelled);
}

#[test]
fn retries_one_transient_failure() {
    let marker = unique_temp_file("flaky");
    let marker_argument = marker.clone().into_os_string();
    let output = ProcessRunner::with_limits(Duration::from_secs(2), 1024 * 1024)
        .run_with_retry(
            OperationKind::Resolve,
            &CancellationToken::default(),
            || request("flaky", std::slice::from_ref(&marker_argument)),
        )
        .expect("second attempt should succeed");
    let _ = std::fs::remove_file(marker);

    assert!(output.status.success());
}

#[cfg(target_os = "windows")]
#[test]
fn timeout_removes_spawned_child_tree() {
    let marker = unique_temp_file("child-pid");
    let error = ProcessRunner::with_limits(Duration::from_millis(600), 1024 * 1024)
        .run(
            request("child-timeout", &[marker.clone().into_os_string()]),
            &CancellationToken::default(),
        )
        .expect_err("fixture must time out");
    assert_eq!(error.kind, ProcessErrorKind::Timeout);

    let pid: u32 = std::fs::read_to_string(&marker)
        .expect("child pid marker should exist")
        .parse()
        .expect("child pid should be numeric");
    let _ = std::fs::remove_file(marker);

    assert!(
        !is_process_alive(pid),
        "spawned child {pid} survived timeout"
    );
}

#[cfg(target_os = "windows")]
fn is_process_alive(pid: u32) -> bool {
    let output = Command::new("tasklist.exe")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .output()
        .expect("tasklist should run");
    String::from_utf8_lossy(&output.stdout).contains(&format!("\"{pid}\""))
}
