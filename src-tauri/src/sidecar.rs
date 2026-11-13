//! SidecarHost: owns the one long-lived `fswatch` process, routes its NDJSON events to
//! subscribers by id, and restarts it (re-sending active watches) if it dies.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Totals {
    pub bytes: u64,
    pub files: u64,
}

#[derive(Deserialize)]
struct RawEvent {
    event: String,
    id: Option<String>,
    #[serde(default)]
    bytes: u64,
    #[serde(default)]
    files: u64,
    message: Option<String>,
}

struct WatchSpec {
    paths: Vec<PathBuf>,
    interval_ms: u64,
    tx: mpsc::UnboundedSender<Totals>,
}

struct Inner {
    app: AppHandle,
    child: Mutex<Option<CommandChild>>,
    watches: Mutex<HashMap<String, WatchSpec>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Totals>>>,
    next_id: AtomicU64,
}

#[derive(Clone)]
pub struct SidecarHost(Arc<Inner>);

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl SidecarHost {
    pub fn new(app: AppHandle) -> Self {
        SidecarHost(Arc::new(Inner {
            app,
            child: Mutex::new(None),
            watches: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }))
    }

    /// Spawns the sidecar and keeps it running for the app's lifetime.
    pub fn start(&self) {
        let host = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut failures = 0u32;
            loop {
                match host.spawn_once() {
                    Ok(mut rx) => {
                        failures = 0;
                        host.resend_watches();
                        while let Some(event) = rx.recv().await {
                            match event {
                                CommandEvent::Stdout(line) => host.route(&line),
                                CommandEvent::Stderr(line) => {
                                    log::warn!("fswatch: {}", String::from_utf8_lossy(&line).trim_end())
                                }
                                CommandEvent::Terminated(payload) => {
                                    log::error!("fswatch exited ({:?}); restarting", payload.code);
                                    break;
                                }
                                _ => {}
                            }
                        }
                        *lock(&host.0.child) = None;
                        // One-off size requests in flight are lost with the process.
                        lock(&host.0.pending).clear();
                    }
                    Err(e) => {
                        failures += 1;
                        log::error!("failed to start fswatch sidecar: {e}");
                    }
                }
                tokio::time::sleep(Duration::from_secs(u64::from(failures.min(30)).max(1))).await;
            }
        });
    }

    fn spawn_once(&self) -> Result<tauri::async_runtime::Receiver<CommandEvent>> {
        let command = self.0.app.shell().sidecar("fswatch").map_err(|e| Error::msg(e.to_string()))?;
        let (rx, child) = command.spawn().map_err(|e| Error::msg(e.to_string()))?;
        *lock(&self.0.child) = Some(child);
        Ok(rx)
    }

    fn send(&self, command: serde_json::Value) {
        let mut line = command.to_string();
        line.push('\n');
        if let Some(child) = lock(&self.0.child).as_mut()
            && let Err(e) = child.write(line.as_bytes())
        {
            log::warn!("fswatch write failed: {e}");
        }
        // No child: the command is replayed by resend_watches() on restart (watches only).
    }

    fn resend_watches(&self) {
        let commands: Vec<_> = lock(&self.0.watches)
            .iter()
            .map(|(id, w)| watch_command(id, &w.paths, w.interval_ms))
            .collect();
        for command in commands {
            self.send(command);
        }
    }

    fn route(&self, line: &[u8]) {
        let Ok(event) = serde_json::from_slice::<RawEvent>(line.trim_ascii()) else {
            log::warn!("fswatch: unparseable line {:?}", String::from_utf8_lossy(line));
            return;
        };
        match (event.event.as_str(), event.id) {
            ("size", Some(id)) => {
                let totals = Totals { bytes: event.bytes, files: event.files };
                if let Some(tx) = lock(&self.0.pending).remove(&id) {
                    let _ = tx.send(totals);
                } else if let Some(watch) = lock(&self.0.watches).get(&id) {
                    let _ = watch.tx.send(totals);
                }
            }
            ("error", id) => log::warn!("fswatch error ({id:?}): {}", event.message.unwrap_or_default()),
            _ => {}
        }
    }

    /// Starts (or replaces) a watch. Totals arrive on the receiver whenever they change.
    pub fn watch(&self, id: &str, paths: Vec<PathBuf>, interval_ms: u64) -> mpsc::UnboundedReceiver<Totals> {
        let (tx, rx) = mpsc::unbounded_channel();
        let command = watch_command(id, &paths, interval_ms);
        lock(&self.0.watches).insert(id.to_string(), WatchSpec { paths, interval_ms, tx });
        self.send(command);
        rx
    }

    pub fn unwatch(&self, id: &str) {
        if lock(&self.0.watches).remove(id).is_some() {
            self.send(serde_json::json!({ "op": "unwatch", "id": id }));
        }
    }

    /// One-off size of a file or folder tree.
    pub async fn size(&self, path: PathBuf) -> Result<Totals> {
        let id = format!("size-{}", self.0.next_id.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = oneshot::channel();
        lock(&self.0.pending).insert(id.clone(), tx);
        self.send(serde_json::json!({ "op": "size", "id": id, "path": path }));
        let result = tokio::time::timeout(Duration::from_secs(120), rx).await;
        lock(&self.0.pending).remove(&id);
        match result {
            Ok(Ok(totals)) => Ok(totals),
            Ok(Err(_)) => Err(Error::msg("fswatch restarted before answering")),
            Err(_) => Err(Error::msg("fswatch did not answer within 120s")),
        }
    }
}

fn watch_command(id: &str, paths: &[PathBuf], interval_ms: u64) -> serde_json::Value {
    serde_json::json!({ "op": "watch", "id": id, "paths": paths, "intervalMs": interval_ms })
}

#[tauri::command]
pub async fn fs_size(host: State<'_, SidecarHost>, path: PathBuf) -> Result<Totals> {
    host.size(path).await
}

/// Watches are namespaced so UI watches can't collide with job progress watches.
#[tauri::command]
pub fn fs_watch(
    host: State<'_, SidecarHost>,
    id: String,
    paths: Vec<PathBuf>,
    interval_ms: Option<u64>,
    on_event: Channel<Totals>,
) {
    let mut rx = host.watch(&format!("ui:{id}"), paths, interval_ms.unwrap_or(500));
    tauri::async_runtime::spawn(async move {
        while let Some(totals) = rx.recv().await {
            if on_event.send(totals).is_err() {
                break;
            }
        }
    });
}

#[tauri::command]
pub fn fs_unwatch(host: State<'_, SidecarHost>, id: String) {
    host.unwatch(&format!("ui:{id}"));
}
