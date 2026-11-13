//! One job = one SteamCMD process downloading a batch of items for one app on one worker slot.
//! Events stream to the frontend over a Channel; the frontend persists them.

use super::install::{self, EXE};
use super::parse::{self, GuardKind, Line};
use super::pool::WorkerPool;
use crate::error::{Error, Result};
use crate::library;
use crate::sidecar::SidecarHost;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::State;
use tokio::io::AsyncReadExt;
use tokio::sync::watch;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobItem {
    pub id: String,
    /// `time_updated` from the Web API; the snapshot folder name.
    pub time_updated: i64,
    /// Expected size from the Web API; progress target.
    pub file_size: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRequest {
    pub job_id: String,
    pub app_id: u32,
    pub items: Vec<JobItem>,
    pub library_path: PathBuf,
    /// Steam username; anonymous when absent.
    pub account: Option<String>,
    pub guard_code: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Done,
    Partial,
    Failed,
    Cancelled,
    NeedsGuard,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum JobEvent {
    Queued,
    Started { slot: usize },
    Log { line: String },
    Progress { item_id: String, bytes: u64, total: u64 },
    ItemDone { item_id: String, time_updated: i64, path: PathBuf, size_bytes: u64 },
    ItemFailed { item_id: String, reason: String },
    LoginOk,
    SteamGuard { kind: GuardKind },
    Finished { status: JobStatus, error: Option<String> },
}

type Emit = Arc<dyn Fn(JobEvent) + Send + Sync>;

pub struct JobManager {
    pool: Arc<WorkerPool>,
    sidecar: SidecarHost,
    cancels: Mutex<HashMap<String, watch::Sender<bool>>>,
    /// Serializes installing/bootstrapping SteamCMD so concurrent first jobs don't race.
    install_lock: tokio::sync::Mutex<()>,
}

enum Outcome {
    Success,
    Failed(String),
}

impl JobManager {
    pub fn new(steamcmd_root: PathBuf, sidecar: SidecarHost, concurrency: usize) -> Arc<Self> {
        Arc::new(JobManager {
            pool: WorkerPool::new(steamcmd_root, concurrency),
            sidecar,
            cancels: Mutex::new(HashMap::new()),
            install_lock: tokio::sync::Mutex::new(()),
        })
    }

    pub fn root(&self) -> &Path {
        self.pool.root()
    }

    fn cancels(&self) -> std::sync::MutexGuard<'_, HashMap<String, watch::Sender<bool>>> {
        self.cancels.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn start(self: &Arc<Self>, request: JobRequest, emit: Emit) -> Result<()> {
        validate(&request)?;
        let (tx, rx) = watch::channel(false);
        if self.cancels().insert(request.job_id.clone(), tx).is_some() {
            return Err(Error::msg(format!("job {} is already running", request.job_id)));
        }
        let manager = self.clone();
        tauri::async_runtime::spawn(async move {
            let job_id = request.job_id.clone();
            let finished = match manager.run(&request, rx, &emit).await {
                Ok(status) => JobEvent::Finished { status, error: None },
                Err(e) => JobEvent::Finished { status: JobStatus::Failed, error: Some(e.to_string()) },
            };
            manager.cancels().remove(&job_id);
            emit(finished);
        });
        Ok(())
    }

    pub fn cancel(&self, job_id: &str) -> bool {
        self.cancels().get(job_id).map(|tx| tx.send(true).is_ok()).unwrap_or(false)
    }

    async fn run(&self, req: &JobRequest, mut cancel: watch::Receiver<bool>, emit: &Emit) -> Result<JobStatus> {
        emit(JobEvent::Queued);
        let slot = tokio::select! {
            slot = self.pool.acquire() => slot,
            _ = cancelled(&mut cancel) => return Ok(JobStatus::Cancelled),
        };
        emit(JobEvent::Started { slot: slot.index });

        let log = {
            let emit = emit.clone();
            move |line: String| emit(JobEvent::Log { line })
        };
        {
            let _installing = self.install_lock.lock().await;
            install::ensure_installed(self.root(), &log).await?;
        }
        let dir = self.pool.prepare(&slot).await?;

        let staging = library::staging_dir(&req.library_path, &req.job_id);
        tokio::fs::create_dir_all(&staging).await?;

        if let Some(user) = &req.account {
            restore_login_cache(self.root(), &dir, user)?;
        }
        let password = match &req.account {
            Some(user) => crate::accounts::password(user)?,
            None => None,
        };
        let args = build_args(req, &staging, password.as_deref());
        emit(JobEvent::Log { line: format!("> {EXE} {}", redact(&args, password.as_deref())) });

        let watch_ids = self.start_progress_watches(req, &staging, emit);
        let result = self.run_process(&dir, &args, &mut cancel, emit).await;
        for id in &watch_ids {
            self.sidecar.unwatch(id);
        }
        let run = match result {
            Ok(run) => run,
            Err(e) => {
                let _ = tokio::fs::remove_dir_all(&staging).await;
                return Err(e);
            }
        };

        let status = self.finish(req, &staging, &dir, run, emit).await;
        let _ = tokio::fs::remove_dir_all(&staging).await;
        status
    }

    fn start_progress_watches(&self, req: &JobRequest, staging: &Path, emit: &Emit) -> Vec<String> {
        let workshop = staging.join("steamapps").join("workshop");
        req.items
            .iter()
            .map(|item| {
                let id = format!("job:{}:{}", req.job_id, item.id);
                let paths = vec![
                    workshop.join("downloads").join(req.app_id.to_string()).join(&item.id),
                    workshop.join("content").join(req.app_id.to_string()).join(&item.id),
                ];
                let mut rx = self.sidecar.watch(&id, paths, 500);
                let emit = emit.clone();
                let (item_id, total) = (item.id.clone(), item.file_size);
                tauri::async_runtime::spawn(async move {
                    while let Some(totals) = rx.recv().await {
                        emit(JobEvent::Progress { item_id: item_id.clone(), bytes: totals.bytes, total });
                    }
                });
                id
            })
            .collect()
    }

    async fn run_process(
        &self,
        dir: &Path,
        args: &[String],
        cancel: &mut watch::Receiver<bool>,
        emit: &Emit,
    ) -> Result<RunResult> {
        let mut child = install::command(dir).args(args).spawn()?;
        let mut stdout = child.stdout.take().expect("piped");
        let mut stderr = child.stderr.take().expect("piped");
        let (mut out_buf, mut err_buf) = (Vec::new(), Vec::new());
        let (mut out_chunk, mut err_chunk) = ([0u8; 4096], [0u8; 4096]);
        let (mut out_done, mut err_done) = (false, false);
        let mut run = RunResult::default();

        while !(out_done && err_done) {
            tokio::select! {
                n = stdout.read(&mut out_chunk), if !out_done => {
                    let n = n?;
                    if n == 0 { out_done = true; out_buf.push(b'\n'); } else { out_buf.extend_from_slice(&out_chunk[..n]); }
                    run.consume(&mut out_buf, emit);
                }
                n = stderr.read(&mut err_chunk), if !err_done => {
                    let n = n?;
                    if n == 0 { err_done = true; err_buf.push(b'\n'); } else { err_buf.extend_from_slice(&err_chunk[..n]); }
                    run.consume(&mut err_buf, emit);
                }
                _ = cancelled(cancel) => {
                    run.cancelled = true;
                    let _ = child.kill().await;
                    break;
                }
            }
            if run.guard.is_some() {
                // SteamCMD is waiting for a code on stdin, which is closed: stop it and ask the user.
                let _ = child.kill().await;
                break;
            }
        }
        let code = child.wait().await?.code();
        emit(JobEvent::Log { line: format!("SteamCMD exited with {code:?}") });
        Ok(run)
    }

    async fn finish(&self, req: &JobRequest, staging: &Path, dir: &Path, run: RunResult, emit: &Emit) -> Result<JobStatus> {
        if run.cancelled {
            return Ok(JobStatus::Cancelled);
        }
        if let Some(kind) = run.guard.or_else(|| run.login_failed.as_deref().and_then(parse::guard_needed)) {
            emit(JobEvent::SteamGuard { kind });
            return Ok(JobStatus::NeedsGuard);
        }
        if let Some(reason) = run.login_failed {
            return Err(Error::msg(format!("Steam login failed: {reason}")));
        }
        if run.rate_limited {
            return Err(Error::msg("Steam rate limit exceeded; wait a while before retrying"));
        }
        if let (Some(user), true) = (&req.account, run.login_ok) {
            save_login_cache(self.root(), dir, user);
        }

        let content = staging.join("steamapps").join("workshop").join("content").join(req.app_id.to_string());
        let mut succeeded = 0;
        for item in &req.items {
            let src = content.join(&item.id);
            let outcome = match run.outcomes.get(&item.id) {
                Some(Outcome::Success) => Ok(()),
                Some(Outcome::Failed(reason)) => Err(reason.clone()),
                // No result line seen (e.g. output lost): trust the files if SteamCMD left any.
                None if dir_has_entries(&src) => {
                    emit(JobEvent::Log { line: format!("No result line for {}; using downloaded files", item.id) });
                    Ok(())
                }
                None => Err("SteamCMD reported no result for this item".to_string()),
            };
            match outcome {
                Ok(()) => {
                    let dest = library::snapshot_dir(&req.library_path, req.app_id, &item.id, item.time_updated);
                    let (from, to) = (src.clone(), dest.clone());
                    let moved = tokio::task::spawn_blocking(move || library::move_into(&from, &to))
                        .await
                        .map_err(|e| Error::msg(e.to_string()))
                        .and_then(|r| r);
                    match moved {
                        Ok(()) => {
                            let size_bytes = self.sidecar.size(dest.clone()).await.map(|t| t.bytes).unwrap_or(0);
                            succeeded += 1;
                            emit(JobEvent::ItemDone {
                                item_id: item.id.clone(),
                                time_updated: item.time_updated,
                                path: dest,
                                size_bytes,
                            });
                        }
                        Err(e) => emit(JobEvent::ItemFailed { item_id: item.id.clone(), reason: format!("move failed: {e}") }),
                    }
                }
                Err(reason) => emit(JobEvent::ItemFailed { item_id: item.id.clone(), reason }),
            }
        }

        Ok(match succeeded {
            n if n == req.items.len() => JobStatus::Done,
            0 => JobStatus::Failed,
            _ => JobStatus::Partial,
        })
    }
}

#[derive(Default)]
struct RunResult {
    outcomes: HashMap<String, Outcome>,
    login_ok: bool,
    login_failed: Option<String>,
    guard: Option<GuardKind>,
    rate_limited: bool,
    cancelled: bool,
}

impl RunResult {
    fn consume(&mut self, buf: &mut Vec<u8>, emit: &Emit) {
        for raw in parse::drain_lines(buf) {
            let line = parse::strip_ansi(&raw);
            match parse::parse_line(&line) {
                Line::ItemSuccess { item_id, .. } => {
                    self.outcomes.insert(item_id, Outcome::Success);
                }
                Line::ItemFailed { item_id, reason } => {
                    self.outcomes.insert(item_id, Outcome::Failed(reason));
                }
                Line::LoginOk => {
                    self.login_ok = true;
                    emit(JobEvent::LoginOk);
                }
                Line::LoginFailed { reason } => self.login_failed = Some(reason),
                Line::GuardPrompt(kind) => self.guard = Some(kind),
                Line::RateLimited => self.rate_limited = true,
                Line::Other => {}
            }
            emit(JobEvent::Log { line });
        }
        // Prompts have no line ending, so check the unterminated tail too.
        if let Some(kind) = parse::guard_prompt(&String::from_utf8_lossy(buf)) {
            emit(JobEvent::Log { line: String::from_utf8_lossy(buf).into_owned() });
            buf.clear();
            self.guard = Some(kind);
        }
    }
}

/// Resolves once the job is cancelled (the borrow guard from `wait_for` isn't `Send`, so it's
/// dropped here instead of living across the select's awaits).
async fn cancelled(rx: &mut watch::Receiver<bool>) {
    if rx.wait_for(|c| *c).await.is_err() {
        // Sender gone means the job was dropped from the map; never resolve.
        std::future::pending::<()>().await;
    }
}

fn validate(req: &JobRequest) -> Result<()> {
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if req.items.is_empty() {
        return Err(Error::msg("job has no items"));
    }
    if let Some(bad) = req.items.iter().find(|i| !digits(&i.id)) {
        return Err(Error::msg(format!("invalid workshop item id {:?}", bad.id)));
    }
    if req.job_id.is_empty() || !req.job_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err(Error::msg("invalid job id"));
    }
    if let Some(user) = &req.account
        && (user.is_empty() || user.chars().any(|c| c.is_whitespace() || c == '+' || c == '"'))
    {
        return Err(Error::msg("invalid Steam username"));
    }
    if let Some(code) = &req.guard_code
        && !code.chars().all(|c| c.is_ascii_alphanumeric())
    {
        return Err(Error::msg("invalid Steam Guard code"));
    }
    if !req.library_path.is_absolute() {
        return Err(Error::msg("library path must be absolute"));
    }
    Ok(())
}

fn build_args(req: &JobRequest, staging: &Path, password: Option<&str>) -> Vec<String> {
    let mut args = vec!["+force_install_dir".to_string(), staging.display().to_string()];
    if let Some(code) = &req.guard_code {
        args.extend(["+set_steam_guard_code".to_string(), code.clone()]);
    }
    args.push("+login".into());
    match &req.account {
        None => args.push("anonymous".into()),
        Some(user) => {
            args.push(user.clone());
            // Passed as an argument because SteamCMD's password prompt is not known to work over a
            // pipe. Downside: visible to other processes of the same user (see HANDOFF.md).
            if let Some(password) = password {
                args.push(password.to_string());
            }
        }
    }
    for item in &req.items {
        args.extend([
            "+workshop_download_item".to_string(),
            req.app_id.to_string(),
            item.id.clone(),
            "validate".to_string(),
        ]);
    }
    args.push("+quit".into());
    args
}

fn redact(args: &[String], password: Option<&str>) -> String {
    args.iter()
        .map(|a| if Some(a.as_str()) == password { "********" } else { a.as_str() })
        .collect::<Vec<_>>()
        .join(" ")
}

fn dir_has_entries(path: &Path) -> bool {
    std::fs::read_dir(path).map(|mut d| d.next().is_some()).unwrap_or(false)
}

// SteamCMD keeps the remembered login in config/config.vdf. After a successful login in one
// worker, it's copied to a shared cache and restored into other workers before they log in.
// Whether this is enough for SteamCMD to skip Steam Guard is unverified (see HANDOFF.md).
fn login_cache(root: &Path, user: &str) -> PathBuf {
    root.join("login-cache").join(user).join("config.vdf")
}

fn save_login_cache(root: &Path, worker: &Path, user: &str) {
    let cache = login_cache(root, user);
    let src = worker.join("config").join("config.vdf");
    if src.is_file() {
        let _ = std::fs::create_dir_all(cache.parent().expect("has parent"));
        if let Err(e) = std::fs::copy(&src, &cache) {
            log::warn!("could not cache Steam login: {e}");
        }
    }
}

fn restore_login_cache(root: &Path, worker: &Path, user: &str) -> Result<()> {
    let cache = login_cache(root, user);
    if !cache.is_file() {
        return Ok(());
    }
    let dest = worker.join("config").join("config.vdf");
    let newer = match (cache.metadata().and_then(|m| m.modified()), dest.metadata().and_then(|m| m.modified())) {
        (Ok(c), Ok(d)) => c > d,
        _ => true,
    };
    if newer {
        std::fs::create_dir_all(worker.join("config"))?;
        std::fs::copy(&cache, &dest)?;
    }
    Ok(())
}

// --- commands ---

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamCmdStatus {
    installed: bool,
    root: PathBuf,
    concurrency: usize,
}

#[tauri::command]
pub fn job_start(manager: State<'_, Arc<JobManager>>, request: JobRequest, on_event: Channel<JobEvent>) -> Result<()> {
    let emit: Emit = Arc::new(move |event| {
        let _ = on_event.send(event);
    });
    manager.start(request, emit)
}

#[tauri::command]
pub fn job_cancel(manager: State<'_, Arc<JobManager>>, job_id: String) -> bool {
    manager.cancel(&job_id)
}

#[tauri::command]
pub fn jobs_set_concurrency(manager: State<'_, Arc<JobManager>>, concurrency: usize) {
    manager.pool.resize(concurrency);
}

#[tauri::command]
pub fn steamcmd_status(manager: State<'_, Arc<JobManager>>) -> SteamCmdStatus {
    SteamCmdStatus {
        installed: install::is_installed(manager.root()),
        root: manager.root().to_path_buf(),
        concurrency: manager.pool.size(),
    }
}

/// Installs SteamCMD (or wipes and reinstalls it). Don't call while jobs are running.
#[tauri::command]
pub async fn steamcmd_install(
    manager: State<'_, Arc<JobManager>>,
    reinstall: bool,
    on_log: Channel<String>,
) -> Result<()> {
    let log = move |line: String| {
        let _ = on_log.send(line);
    };
    if reinstall && !manager.cancels().is_empty() {
        return Err(Error::msg("Cancel or wait for running jobs before reinstalling SteamCMD"));
    }
    let _installing = manager.install_lock.lock().await;
    if reinstall {
        install::reinstall(manager.root(), &log).await
    } else {
        install::ensure_installed(manager.root(), &log).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> JobRequest {
        JobRequest {
            job_id: "job-1".into(),
            app_id: 294100,
            items: vec![
                JobItem { id: "1".into(), time_updated: 10, file_size: 5 },
                JobItem { id: "2".into(), time_updated: 11, file_size: 6 },
            ],
            library_path: std::env::temp_dir(),
            account: None,
            guard_code: None,
        }
    }

    #[test]
    fn builds_anonymous_args() {
        let args = build_args(&request(), Path::new("/stage"), None);
        assert_eq!(
            args.join(" "),
            "+force_install_dir /stage +login anonymous +workshop_download_item 294100 1 validate +workshop_download_item 294100 2 validate +quit"
        );
    }

    #[test]
    fn builds_account_args_and_redacts_password() {
        let mut req = request();
        req.account = Some("bob".into());
        req.guard_code = Some("AB12C".into());
        let args = build_args(&req, Path::new("/stage"), Some("hunter2"));
        assert!(args.join(" ").starts_with("+force_install_dir /stage +set_steam_guard_code AB12C +login bob hunter2 "));
        assert!(!redact(&args, Some("hunter2")).contains("hunter2"));
    }

    #[test]
    fn rejects_bad_input() {
        let mut req = request();
        req.items[0].id = "+quit".into();
        assert!(validate(&req).is_err());

        let mut req = request();
        req.account = Some("bob +quit".into());
        assert!(validate(&req).is_err());

        let mut req = request();
        req.job_id = "../x".into();
        assert!(validate(&req).is_err());

        assert!(validate(&request()).is_ok());
    }

    #[test]
    fn detects_guard_prompt_without_newline() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        let emit: Emit = Arc::new(move |e| sink.lock().unwrap().push(e));
        let mut run = RunResult::default();
        let mut buf = b"Logging in user 'bob' [U:1:0] to Steam Public...\nSteam Guard code:".to_vec();
        run.consume(&mut buf, &emit);
        assert_eq!(run.guard, Some(GuardKind::Email));
        assert!(buf.is_empty());
    }
}
