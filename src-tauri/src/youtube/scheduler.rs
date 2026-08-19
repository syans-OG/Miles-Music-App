use super::process::CancellationToken;
use super::types::SpotifyMatchPriority;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

const SCHEDULER_POLL_INTERVAL: Duration = Duration::from_millis(20);
static NEXT_SCHEDULE_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum ResolvePriority {
    ExplicitSelection = 0,
    ImportedFirstTrack = 1,
    SequentialNext = 2,
    Prefetch = 3,
}

#[derive(Clone, Default)]
pub struct YoutubeScheduler {
    import: Arc<Slot>,
    resolve: Arc<Slot>,
    spotify_match: Arc<Slot>,
}

impl YoutubeScheduler {
    pub fn acquire_import(
        &self,
        cancellation: CancellationToken,
    ) -> Result<SchedulePermit, ScheduleError> {
        self.import.acquire(0, false, cancellation)
    }

    pub fn acquire_resolve(
        &self,
        priority: ResolvePriority,
        cancellation: CancellationToken,
    ) -> Result<SchedulePermit, ScheduleError> {
        let preempt_equal = priority == ResolvePriority::ExplicitSelection;
        self.resolve.acquire(priority as u8, preempt_equal, cancellation)
    }

    pub fn acquire_spotify_match(
        &self,
        priority: SpotifyMatchPriority,
        cancellation: CancellationToken,
    ) -> Result<SchedulePermit, ScheduleError> {
        let priority_u8 = match priority {
            SpotifyMatchPriority::Playback => 0,
            SpotifyMatchPriority::Import => 1,
        };
        self.spotify_match.acquire(priority_u8, false, cancellation)
    }

    pub fn cancel_import(&self) {
        self.import.cancel_all();
    }

    pub fn cancel_resolve(&self) {
        self.resolve.cancel_all();
    }

    pub fn cancel_spotify_match(&self) {
        self.spotify_match.cancel_all();
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScheduleError {
    Cancelled,
}

pub struct SchedulePermit {
    slot: Arc<Slot>,
    request_id: u64,
    cancellation: CancellationToken,
}

impl SchedulePermit {
    pub fn request_id(&self) -> u64 {
        self.request_id
    }

    pub fn is_current(&self) -> bool {
        !self.cancellation.is_cancelled() && self.slot.is_active(self.request_id)
    }
}

impl Drop for SchedulePermit {
    fn drop(&mut self) {
        self.slot.release(self.request_id);
    }
}

#[derive(Default)]
struct Slot {
    state: Mutex<SlotState>,
    changed: Condvar,
}

#[derive(Default)]
struct SlotState {
    active: Option<ActiveRequest>,
    waiting: HashMap<u64, WaitingRequest>,
}

struct ActiveRequest {
    request_id: u64,
    priority: u8,
    cancellation: CancellationToken,
}

struct WaitingRequest {
    priority: u8,
    cancellation: CancellationToken,
}

impl Slot {
    fn cancel_all(&self) {
        let state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if let Some(active) = &state.active {
            active.cancellation.cancel();
        }
        for waiting in state.waiting.values() {
            waiting.cancellation.cancel();
        }
        self.changed.notify_all();
    }

    fn acquire(
        self: &Arc<Self>,
        priority: u8,
        preempt_equal: bool,
        cancellation: CancellationToken,
    ) -> Result<SchedulePermit, ScheduleError> {
        let request_id = NEXT_SCHEDULE_ID.fetch_add(1, Ordering::Relaxed);
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if preempt_equal {
            for waiting in state
                .waiting
                .values()
                .filter(|waiting| waiting.priority == priority)
            {
                waiting.cancellation.cancel();
            }
        }
        state.waiting.insert(
            request_id,
            WaitingRequest {
                priority,
                cancellation: cancellation.clone(),
            },
        );

        loop {
            if cancellation.is_cancelled() {
                state.waiting.remove(&request_id);
                self.changed.notify_all();
                return Err(ScheduleError::Cancelled);
            }
            if state.active.as_ref().is_some_and(|active| {
                priority < active.priority
                    || (preempt_equal && active.priority == priority)
            }) {
                state.active.as_ref().unwrap().cancellation.cancel();
            }
            if state.active.is_none() && is_next_waiter(&state, request_id) {
                state.waiting.remove(&request_id);
                state.active = Some(ActiveRequest {
                    request_id,
                    priority,
                    cancellation: cancellation.clone(),
                });
                return Ok(SchedulePermit {
                    slot: self.clone(),
                    request_id,
                    cancellation,
                });
            }
            state = self
                .changed
                .wait_timeout(state, SCHEDULER_POLL_INTERVAL)
                .unwrap_or_else(|error| error.into_inner())
                .0;
        }
    }

    fn release(&self, request_id: u64) {
        let mut state = self.state.lock().unwrap_or_else(|error| error.into_inner());
        if state.active.as_ref().map(|active| active.request_id) == Some(request_id) {
            state.active = None;
            self.changed.notify_all();
        }
    }

    fn is_active(&self, request_id: u64) -> bool {
        self.state
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .active
            .as_ref()
            .is_some_and(|active| active.request_id == request_id)
    }
}

fn is_next_waiter(state: &SlotState, request_id: u64) -> bool {
    state
        .waiting
        .iter()
        .min_by_key(|(id, waiting)| (waiting.priority, **id))
        .is_some_and(|(id, _)| *id == request_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;

    #[test]
    fn import_and_resolve_and_spotify_match_have_independent_slots() {
        let scheduler = YoutubeScheduler::default();
        let import = scheduler
            .acquire_import(CancellationToken::default())
            .expect("import slot should be available");
        let resolve = scheduler
            .acquire_resolve(
                ResolvePriority::SequentialNext,
                CancellationToken::default(),
            )
            .expect("resolve slot should be independently available");
        let spotify_match = scheduler
            .acquire_spotify_match(SpotifyMatchPriority::Playback, CancellationToken::default())
            .expect("spotify match slot should be independently available");

        drop((import, resolve, spotify_match));
    }

    #[test]
    fn explicit_selection_preempts_prefetch() {
        let scheduler = YoutubeScheduler::default();
        let prefetch_cancellation = CancellationToken::default();
        let prefetch = scheduler
            .acquire_resolve(ResolvePriority::Prefetch, prefetch_cancellation.clone())
            .expect("prefetch should acquire slot");
        let (sender, receiver) = mpsc::channel();
        let next_scheduler = scheduler.clone();

        let worker = thread::spawn(move || {
            let permit = next_scheduler.acquire_resolve(
                ResolvePriority::ExplicitSelection,
                CancellationToken::default(),
            );
            sender.send(permit.is_ok()).expect("result should send");
        });

        for _ in 0..50 {
            if prefetch_cancellation.is_cancelled() {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(prefetch_cancellation.is_cancelled());
        assert!(!prefetch.is_current());
        drop(prefetch);
        assert_eq!(receiver.recv_timeout(Duration::from_secs(1)), Ok(true));
        worker.join().expect("worker should finish");
    }

    #[test]
    fn newest_explicit_selection_cancels_older_waiter() {
        let scheduler = YoutubeScheduler::default();
        let active = scheduler
            .acquire_resolve(ResolvePriority::Prefetch, CancellationToken::default())
            .expect("prefetch should hold the active slot");
        let older_cancellation = CancellationToken::default();
        let older_scheduler = scheduler.clone();
        let older_token = older_cancellation.clone();
        let (older_sender, older_receiver) = mpsc::channel();
        let older = thread::spawn(move || {
            let result =
                older_scheduler.acquire_resolve(ResolvePriority::ExplicitSelection, older_token);
            older_sender
                .send(result.is_err())
                .expect("older result should send");
        });

        for _ in 0..50 {
            if scheduler
                .resolve
                .state
                .lock()
                .unwrap_or_else(|error| error.into_inner())
                .waiting
                .len()
                == 1
            {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }

        let newer_scheduler = scheduler.clone();
        let (newer_sender, newer_receiver) = mpsc::channel();
        let newer = thread::spawn(move || {
            let permit = newer_scheduler.acquire_resolve(
                ResolvePriority::ExplicitSelection,
                CancellationToken::default(),
            );
            newer_sender
                .send(permit.is_ok())
                .expect("newer result should send");
        });

        for _ in 0..50 {
            if older_cancellation.is_cancelled() {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(older_cancellation.is_cancelled());
        drop(active);
        assert_eq!(
            older_receiver.recv_timeout(Duration::from_secs(1)),
            Ok(true)
        );
        assert_eq!(
            newer_receiver.recv_timeout(Duration::from_secs(1)),
            Ok(true)
        );
        older.join().expect("older worker should finish");
        newer.join().expect("newer worker should finish");
    }

    #[test]
    fn cancel_import_invalidates_active_permit_without_touching_resolve() {
        let scheduler = YoutubeScheduler::default();
        let import = scheduler
            .acquire_import(CancellationToken::default())
            .expect("import slot should be available");
        let resolve = scheduler
            .acquire_resolve(
                ResolvePriority::SequentialNext,
                CancellationToken::default(),
            )
            .expect("resolve slot should be available");

        scheduler.cancel_import();

        assert!(!import.is_current());
        assert!(resolve.is_current());
    }
}
