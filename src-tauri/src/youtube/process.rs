use std::collections::HashSet;
use std::ffi::OsString;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

const POLL_INTERVAL: Duration = Duration::from_millis(20);
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_STDOUT_BYTES: usize = 8 * 1024 * 1024;
const MAX_STDERR_BYTES: usize = 256 * 1024;
static NEXT_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
static ACTIVE_PROCESS_IDS: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();

#[derive(Clone, Copy, Debug)]
pub enum OperationKind {
    Import,
    Resolve,
}

impl OperationKind {
    fn label(self) -> &'static str {
        match self {
            Self::Import => "import",
            Self::Resolve => "resolve",
        }
    }
}

pub struct ProcessRequest {
    pub program: PathBuf,
    pub arguments: Vec<OsString>,
    pub operation: OperationKind,
}

#[derive(Debug)]
pub struct ProcessOutput {
    pub request_id: u64,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub status: ExitStatus,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProcessErrorKind {
    SpawnFailed,
    Timeout,
    Cancelled,
    OutputTooLarge,
    ProcessFailed,
    CleanupFailed,
}

#[derive(Debug)]
pub struct ProcessError {
    pub request_id: u64,
    pub kind: ProcessErrorKind,
    pub exit_code: Option<i32>,
    diagnostic: Vec<u8>,
}

impl ProcessError {
    pub fn is_retryable(&self) -> bool {
        matches!(
            self.kind,
            ProcessErrorKind::Timeout | ProcessErrorKind::ProcessFailed
        )
    }

    pub fn diagnostic_contains(&self, pattern: &str) -> bool {
        String::from_utf8_lossy(&self.diagnostic)
            .to_ascii_lowercase()
            .contains(&pattern.to_ascii_lowercase())
    }
}

#[derive(Clone, Default)]
pub struct CancellationToken {
    cancelled: Arc<AtomicBool>,
}

impl CancellationToken {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

#[derive(Clone)]
pub struct ProcessRunner {
    timeout: Duration,
    max_stdout_bytes: usize,
    max_stderr_bytes: usize,
}

impl Default for ProcessRunner {
    fn default() -> Self {
        Self {
            timeout: DEFAULT_TIMEOUT,
            max_stdout_bytes: MAX_STDOUT_BYTES,
            max_stderr_bytes: MAX_STDERR_BYTES,
        }
    }
}

impl ProcessRunner {
    pub fn with_limits(timeout: Duration, max_stdout_bytes: usize) -> Self {
        Self {
            timeout,
            max_stdout_bytes,
            max_stderr_bytes: 64 * 1024,
        }
    }

    pub fn run(
        &self,
        request: ProcessRequest,
        cancellation: &CancellationToken,
    ) -> Result<ProcessOutput, ProcessError> {
        let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        self.run_attempt(request_id, request, cancellation, 1)
    }

    pub fn run_with_retry<F>(
        &self,
        operation: OperationKind,
        cancellation: &CancellationToken,
        create_request: F,
    ) -> Result<ProcessOutput, ProcessError>
    where
        F: FnMut() -> ProcessRequest,
    {
        self.run_with_retry_if(
            operation,
            cancellation,
            create_request,
            ProcessError::is_retryable,
        )
    }

    pub fn run_with_retry_if<F, P>(
        &self,
        operation: OperationKind,
        cancellation: &CancellationToken,
        mut create_request: F,
        should_retry: P,
    ) -> Result<ProcessOutput, ProcessError>
    where
        F: FnMut() -> ProcessRequest,
        P: Fn(&ProcessError) -> bool,
    {
        let request_id = NEXT_REQUEST_ID.fetch_add(1, Ordering::Relaxed);
        for attempt in 1..=2 {
            let result = self.run_attempt(request_id, create_request(), cancellation, attempt);
            match result {
                Err(error)
                    if attempt == 1 && should_retry(&error) && !cancellation.is_cancelled() =>
                {
                    log::warn!(
                        "youtube_process_retry request_id={} operation={} attempt={}",
                        request_id,
                        operation.label(),
                        attempt
                    );
                }
                other => return other,
            }
        }
        unreachable!()
    }

    fn run_attempt(
        &self,
        request_id: u64,
        request: ProcessRequest,
        cancellation: &CancellationToken,
        attempt: u8,
    ) -> Result<ProcessOutput, ProcessError> {
        let started = Instant::now();
        let mut child = spawn_child(&request).map_err(|_| ProcessError {
            request_id,
            kind: ProcessErrorKind::SpawnFailed,
            exit_code: None,
            diagnostic: Vec::new(),
        })?;
        let _active_process = ActiveProcess::register(child.id());
        let readers =
            start_output_readers(&mut child, self.max_stdout_bytes, self.max_stderr_bytes)
                .map_err(|_| ProcessError {
                    request_id,
                    kind: ProcessErrorKind::SpawnFailed,
                    exit_code: None,
                    diagnostic: Vec::new(),
                })?;
        let status = self.wait_for_child(request_id, &mut child, cancellation, &readers)?;
        let (stdout, stderr) = readers.finish(request_id)?;

        log::info!(
            "youtube_process_complete request_id={} operation={} attempt={} duration_ms={} success={} exit_code={:?}",
            request_id,
            request.operation.label(),
            attempt,
            started.elapsed().as_millis(),
            status.success(),
            status.code()
        );
        if !status.success() {
            return Err(ProcessError {
                request_id,
                kind: ProcessErrorKind::ProcessFailed,
                exit_code: status.code(),
                diagnostic: stderr,
            });
        }

        Ok(ProcessOutput {
            request_id,
            stdout,
            stderr,
            status,
        })
    }

    fn wait_for_child(
        &self,
        request_id: u64,
        child: &mut Child,
        cancellation: &CancellationToken,
        readers: &OutputReaders,
    ) -> Result<ExitStatus, ProcessError> {
        let deadline = Instant::now() + self.timeout;
        loop {
            if cancellation.is_cancelled() {
                terminate_and_wait(child, request_id)?;
                return Err(process_error(request_id, ProcessErrorKind::Cancelled));
            }
            if Instant::now() >= deadline {
                terminate_and_wait(child, request_id)?;
                return Err(process_error(request_id, ProcessErrorKind::Timeout));
            }
            if readers.has_overflowed() {
                terminate_and_wait(child, request_id)?;
                return Err(process_error(request_id, ProcessErrorKind::OutputTooLarge));
            }
            match child.try_wait() {
                Ok(Some(status)) => return Ok(status),
                Ok(None) => thread::sleep(POLL_INTERVAL),
                Err(_) => {
                    terminate_and_wait(child, request_id)?;
                    return Err(process_error(request_id, ProcessErrorKind::ProcessFailed));
                }
            }
        }
    }
}

pub fn isolated_ytdlp_arguments(
    deno_path: &Path,
    operation_arguments: &[&str],
    validated_url: &str,
) -> Vec<OsString> {
    let mut arguments = vec![
        OsString::from("--ignore-config"),
        OsString::from("--no-update"),
        OsString::from("--no-js-runtimes"),
        OsString::from("--js-runtimes"),
        OsString::from(format!("deno:{}", deno_path.display())),
    ];
    arguments.extend(operation_arguments.iter().map(OsString::from));
    arguments.push(OsString::from("--"));
    arguments.push(OsString::from(validated_url));
    arguments
}

pub fn terminate_all_active_processes() {
    let process_ids: Vec<u32> = active_process_ids()
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .iter()
        .copied()
        .collect();
    for process_id in process_ids {
        if terminate_process_tree(process_id).is_err() {
            log::error!("youtube_process_shutdown_cleanup_failed pid={process_id}");
        }
    }
}

struct ActiveProcess {
    process_id: u32,
}

impl ActiveProcess {
    fn register(process_id: u32) -> Self {
        active_process_ids()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .insert(process_id);
        Self { process_id }
    }
}

impl Drop for ActiveProcess {
    fn drop(&mut self) {
        active_process_ids()
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .remove(&self.process_id);
    }
}

fn active_process_ids() -> &'static Mutex<HashSet<u32>> {
    ACTIVE_PROCESS_IDS.get_or_init(|| Mutex::new(HashSet::new()))
}

struct OutputReaders {
    stdout: thread::JoinHandle<io::Result<Vec<u8>>>,
    stderr: thread::JoinHandle<io::Result<Vec<u8>>>,
    overflowed: Arc<AtomicBool>,
}

impl OutputReaders {
    fn has_overflowed(&self) -> bool {
        self.overflowed.load(Ordering::Acquire)
    }

    fn finish(self, request_id: u64) -> Result<(Vec<u8>, Vec<u8>), ProcessError> {
        let stdout = join_reader(self.stdout, request_id)?;
        let stderr = join_reader(self.stderr, request_id)?;
        Ok((stdout, stderr))
    }
}

fn spawn_child(request: &ProcessRequest) -> io::Result<Child> {
    let mut command = Command::new(&request.program);
    command
        .args(&request.arguments)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.spawn()
}

fn start_output_readers(
    child: &mut Child,
    stdout_limit: usize,
    stderr_limit: usize,
) -> io::Result<OutputReaders> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| io::Error::other("stdout unavailable"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| io::Error::other("stderr unavailable"))?;
    let overflowed = Arc::new(AtomicBool::new(false));
    Ok(OutputReaders {
        stdout: spawn_reader(stdout, stdout_limit, overflowed.clone()),
        stderr: spawn_reader(stderr, stderr_limit, overflowed.clone()),
        overflowed,
    })
}

fn spawn_reader<R: Read + Send + 'static>(
    mut reader: R,
    limit: usize,
    overflowed: Arc<AtomicBool>,
) -> thread::JoinHandle<io::Result<Vec<u8>>> {
    thread::spawn(move || {
        let mut output = Vec::new();
        let mut buffer = [0_u8; 16 * 1024];
        loop {
            let bytes_read = reader.read(&mut buffer)?;
            if bytes_read == 0 {
                return Ok(output);
            }
            if output.len().saturating_add(bytes_read) > limit {
                overflowed.store(true, Ordering::Release);
                return Err(io::Error::other("output limit exceeded"));
            }
            output.extend_from_slice(&buffer[..bytes_read]);
        }
    })
}

fn join_reader(
    reader: thread::JoinHandle<io::Result<Vec<u8>>>,
    request_id: u64,
) -> Result<Vec<u8>, ProcessError> {
    reader
        .join()
        .ok()
        .and_then(Result::ok)
        .ok_or_else(|| process_error(request_id, ProcessErrorKind::OutputTooLarge))
}

fn process_error(request_id: u64, kind: ProcessErrorKind) -> ProcessError {
    ProcessError {
        request_id,
        kind,
        exit_code: None,
        diagnostic: Vec::new(),
    }
}

fn terminate_and_wait(child: &mut Child, request_id: u64) -> Result<(), ProcessError> {
    let pid = child.id();
    if terminate_process_tree(pid).is_err() {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return Ok(());
        }
        child
            .kill()
            .and_then(|_| child.wait().map(|_| ()))
            .map_err(|_| process_error(request_id, ProcessErrorKind::CleanupFailed))?;
        return Ok(());
    }
    child
        .wait()
        .map_err(|_| process_error(request_id, ProcessErrorKind::CleanupFailed))?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn terminate_process_tree(pid: u32) -> io::Result<()> {
    let status = Command::new("taskkill.exe")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other("taskkill failed"))
    }
}

#[cfg(not(target_os = "windows"))]
fn terminate_process_tree(pid: u32) -> io::Result<()> {
    Command::new("kill")
        .args(["-KILL", &pid.to_string()])
        .status()
        .and_then(|status| {
            status
                .success()
                .then_some(())
                .ok_or_else(|| io::Error::other("kill failed"))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isolated_arguments_keep_url_after_option_delimiter() {
        let arguments = isolated_ytdlp_arguments(
            Path::new(r"C:\Miles\deno.exe"),
            &["-J", "--no-playlist"],
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        );
        let values: Vec<_> = arguments
            .iter()
            .map(|value| value.to_string_lossy())
            .collect();

        assert!(values.contains(&"--ignore-config".into()));
        assert!(values.contains(&"--no-js-runtimes".into()));
        assert_eq!(values[values.len() - 2], "--");
        assert!(values
            .last()
            .is_some_and(|value| value.starts_with("https://")));
    }
}
