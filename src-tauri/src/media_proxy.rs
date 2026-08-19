use reqwest::blocking::{Client, Response as UpstreamResponse};
use reqwest::header::{
    ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE, REFERER, USER_AGENT,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use url::Url;

const MAX_SESSIONS: usize = 8;
const MAX_ACTIVE_REQUESTS: usize = 4;
const FALLBACK_SESSION_SECONDS: u64 = 6 * 60 * 60;
const EXPIRY_SAFETY_SECONDS: u64 = 30;
const UPSTREAM_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36";

#[derive(Clone)]
pub struct MediaProxy {
    inner: Arc<MediaProxyInner>,
}

struct MediaProxyInner {
    base_url: String,
    client: Client,
    sessions: Mutex<HashMap<String, ProxySession>>,
    sequence: AtomicU64,
    active_requests: AtomicUsize,
}

#[derive(Clone)]
struct ProxySession {
    upstream_url: String,
    expires_at_unix: u64,
    created_sequence: u64,
}

struct ActiveRequestGuard<'a>(&'a AtomicUsize);

impl Drop for ActiveRequestGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

impl MediaProxy {
    pub fn start() -> Result<Self, String> {
        let server = Server::http("127.0.0.1:0")
            .map_err(|_| "Audio proxy could not bind to loopback".to_string())?;
        let address = server
            .server_addr()
            .to_ip()
            .ok_or_else(|| "Audio proxy did not receive an IP address".to_string())?;
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(8))
            .build()
            .map_err(|_| "Audio proxy HTTP client could not start".to_string())?;
        let proxy = Self {
            inner: Arc::new(MediaProxyInner {
                base_url: format!("http://127.0.0.1:{}", address.port()),
                client,
                sessions: Mutex::new(HashMap::new()),
                sequence: AtomicU64::new(0),
                active_requests: AtomicUsize::new(0),
            }),
        };
        let request_proxy = proxy.clone();
        thread::Builder::new()
            .name("miles-media-proxy".to_string())
            .spawn(move || {
                for request in server.incoming_requests() {
                    let connection_proxy = request_proxy.clone();
                    let _ = thread::Builder::new()
                        .name("miles-media-stream".to_string())
                        .spawn(move || connection_proxy.handle_request(request));
                }
            })
            .map_err(|_| "Audio proxy server thread could not start".to_string())?;
        Ok(proxy)
    }

    pub fn register(
        &self,
        upstream_url: &str,
        expires_at_unix: Option<u64>,
    ) -> Result<String, String> {
        validate_upstream_url(upstream_url)?;
        Ok(self.register_validated(upstream_url, expires_at_unix))
    }

    fn register_validated(&self, upstream_url: &str, expires_at_unix: Option<u64>) -> String {
        let now = unix_time();
        let sequence = self.inner.sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let mut hasher = Sha256::new();
        hasher.update(upstream_url.as_bytes());
        hasher.update(now.to_le_bytes());
        hasher.update(sequence.to_le_bytes());
        hasher.update(std::process::id().to_le_bytes());
        let token = format!("{:x}", hasher.finalize());
        let session = ProxySession {
            upstream_url: upstream_url.to_string(),
            expires_at_unix: expires_at_unix.unwrap_or(now + FALLBACK_SESSION_SECONDS),
            created_sequence: sequence,
        };
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        sessions.retain(|_, entry| entry.expires_at_unix > now + EXPIRY_SAFETY_SECONDS);
        if sessions.len() >= MAX_SESSIONS {
            if let Some(oldest) = sessions
                .iter()
                .min_by_key(|(_, entry)| entry.created_sequence)
                .map(|(key, _)| key.clone())
            {
                sessions.remove(&oldest);
            }
        }
        sessions.insert(token.clone(), session);
        format!("{}/media/{token}", self.inner.base_url)
    }

    fn handle_request(&self, request: Request) {
        if request.method() == &Method::Options {
            let _ = request.respond(empty_response(204));
            return;
        }
        if request.method() != &Method::Get && request.method() != &Method::Head {
            let _ = request.respond(empty_response(405));
            return;
        }
        let Some(token) = request.url().strip_prefix("/media/") else {
            let _ = request.respond(empty_response(404));
            return;
        };
        if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            let _ = request.respond(empty_response(404));
            return;
        }
        let Some(session) = self.session(token) else {
            let _ = request.respond(empty_response(404));
            return;
        };
        if self
            .inner
            .active_requests
            .fetch_add(1, Ordering::AcqRel)
            >= MAX_ACTIVE_REQUESTS
        {
            self.inner.active_requests.fetch_sub(1, Ordering::AcqRel);
            let _ = request.respond(empty_response(503));
            return;
        }
        let _active_guard = ActiveRequestGuard(&self.inner.active_requests);
        let range = request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Range"))
            .map(|header| header.value.as_str().to_string())
            .filter(|value| valid_range_header(value));
        let mut upstream = self
            .inner
            .client
            .get(&session.upstream_url)
            .header(USER_AGENT, UPSTREAM_USER_AGENT)
            .header(REFERER, "https://www.youtube.com/");
        if let Some(range) = range {
            upstream = upstream.header(RANGE, range);
        }
        match upstream.send() {
            Ok(response) => respond_with_upstream(request, response),
            Err(_) => {
                let _ = request.respond(empty_response(502));
            }
        }
    }

    fn session(&self, token: &str) -> Option<ProxySession> {
        let now = unix_time();
        self.inner
            .sessions
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .get(token)
            .filter(|entry| entry.expires_at_unix > now + EXPIRY_SAFETY_SECONDS)
            .cloned()
    }
}

fn validate_upstream_url(value: &str) -> Result<(), String> {
    let url = Url::parse(value).map_err(|_| "Invalid audio stream URL".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "Audio stream URL has no host".to_string())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || (host != "googlevideo.com" && !host.ends_with(".googlevideo.com"))
    {
        return Err("Audio stream host is not allowed".to_string());
    }
    Ok(())
}

fn valid_range_header(value: &str) -> bool {
    if value.len() > 80 || !value.starts_with("bytes=") {
        return false;
    }
    let range = &value[6..];
    let Some((start, end)) = range.split_once('-') else {
        return false;
    };
    !start.is_empty()
        && start.bytes().all(|byte| byte.is_ascii_digit())
        && (end.is_empty() || end.bytes().all(|byte| byte.is_ascii_digit()))
}

fn respond_with_upstream(request: Request, upstream: UpstreamResponse) {
    let status = upstream.status().as_u16();
    if status != 200 && status != 206 {
        let _ = request.respond(empty_response(status));
        return;
    }
    let headers = upstream.headers();
    let mut response_headers = browser_media_headers();
    for name in [CONTENT_TYPE, CONTENT_RANGE, ACCEPT_RANGES] {
        if let Some(value) = headers.get(&name).and_then(|value| value.to_str().ok()) {
            if let Ok(header) = Header::from_bytes(name.as_str().as_bytes(), value.as_bytes()) {
                response_headers.push(header);
            }
        }
    }
    let length = headers
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok());
    let response = Response::new(StatusCode(status), response_headers, upstream, length, None);
    let _ = request.respond(response);
}

fn empty_response(status: u16) -> Response<std::io::Empty> {
    Response::new(
        StatusCode(status),
        browser_media_headers(),
        std::io::empty(),
        Some(0),
        None,
    )
}

fn browser_media_headers() -> Vec<Header> {
    [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"),
        ("Access-Control-Allow-Headers", "Range"),
        ("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range"),
        ("Cross-Origin-Resource-Policy", "cross-origin"),
        ("Cache-Control", "no-store"),
    ]
    .into_iter()
    .filter_map(|(name, value)| Header::from_bytes(name.as_bytes(), value.as_bytes()).ok())
    .collect()
}

fn unix_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_registers_https_googlevideo_urls() {
        let proxy = MediaProxy::start().expect("proxy should start");
        assert!(proxy
            .register("https://rr.example.googlevideo.com/audio.m4a", None)
            .is_ok());
        for invalid in [
            "http://rr.example.googlevideo.com/audio.m4a",
            "https://googlevideo.com.evil.test/audio.m4a",
            "https://user@rr.example.googlevideo.com/audio.m4a",
            "https://rr.example.googlevideo.com:444/audio.m4a",
        ] {
            assert!(proxy.register(invalid, None).is_err(), "accepted {invalid}");
        }
    }

    #[test]
    fn streams_range_responses_with_orb_safe_headers() {
        let upstream = Server::http("127.0.0.1:0").expect("fixture server should bind");
        let upstream_address = upstream.server_addr().to_ip().expect("fixture IP");
        let fixture = thread::spawn(move || {
            let request = upstream.recv().expect("fixture request");
            assert_eq!(request.method(), &Method::Get);
            assert!(request
                .headers()
                .iter()
                .any(|header| header.field.equiv("Range") && header.value.as_str() == "bytes=2-5"));
            let response = Response::from_data(b"cdef".to_vec())
                .with_status_code(206)
                .with_header(Header::from_bytes("Content-Type", "audio/mp4").unwrap())
                .with_header(Header::from_bytes("Content-Range", "bytes 2-5/8").unwrap())
                .with_header(Header::from_bytes("Accept-Ranges", "bytes").unwrap());
            request.respond(response).expect("fixture response");
        });

        let proxy = MediaProxy::start().expect("proxy should start");
        let local_url = proxy.register_validated(
            &format!("http://{upstream_address}/fixture"),
            Some(unix_time() + 300),
        );
        let response = Client::new()
            .get(local_url)
            .header(RANGE, "bytes=2-5")
            .send()
            .expect("proxy response");
        assert_eq!(response.status().as_u16(), 206);
        assert_eq!(response.headers()[CONTENT_TYPE], "audio/mp4");
        assert_eq!(response.headers()[CONTENT_RANGE], "bytes 2-5/8");
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
        assert_eq!(
            response.headers()["cross-origin-resource-policy"],
            "cross-origin"
        );
        assert_eq!(response.bytes().expect("proxy body").as_ref(), b"cdef");
        fixture.join().expect("fixture thread");
    }
}
