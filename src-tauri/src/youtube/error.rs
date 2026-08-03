use serde::Serialize;
use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum YoutubeErrorCode {
    InvalidUrl,
    HttpsRequired,
    UnsupportedHost,
    UnsupportedUrl,
    InvalidVideoId,
    InvalidPlaylistId,
    LiveUnsupported,
    UpcomingUnsupported,
    PrivateVideo,
    AgeRestricted,
    Unavailable,
    InvalidMetadata,
    AudioStreamUnavailable,
    DependencyUnavailable,
    Busy,
    Cancelled,
    Timeout,
    ProcessFailed,
    OutputTooLarge,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeError {
    pub code: YoutubeErrorCode,
    pub retryable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl YoutubeError {
    pub fn new(code: YoutubeErrorCode) -> Self {
        Self {
            code,
            retryable: false,
            detail: None,
        }
    }

    pub fn with_detail(code: YoutubeErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            retryable: false,
            detail: Some(detail.into()),
        }
    }

    pub fn retryable(code: YoutubeErrorCode) -> Self {
        Self {
            code,
            retryable: true,
            detail: None,
        }
    }
}

impl fmt::Display for YoutubeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{:?}", self.code)
    }
}

impl std::error::Error for YoutubeError {}

impl From<super::process::ProcessError> for YoutubeError {
    fn from(error: super::process::ProcessError) -> Self {
        use super::process::ProcessErrorKind;

        let code = match error.kind {
            ProcessErrorKind::SpawnFailed => YoutubeErrorCode::DependencyUnavailable,
            ProcessErrorKind::Timeout => YoutubeErrorCode::Timeout,
            ProcessErrorKind::Cancelled => YoutubeErrorCode::Cancelled,
            ProcessErrorKind::OutputTooLarge => YoutubeErrorCode::OutputTooLarge,
            ProcessErrorKind::ProcessFailed | ProcessErrorKind::CleanupFailed => {
                YoutubeErrorCode::ProcessFailed
            }
        };
        Self {
            code,
            retryable: error.is_retryable(),
            detail: error.exit_code.map(|code| format!("exit_code={code}")),
        }
    }
}
