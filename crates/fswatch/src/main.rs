use fswatch::{Command, Event, Totals, measure, measure_all, parse_command};
use notify::{RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// Minimum gap between rescans triggered by filesystem events. SteamCMD writes in bursts,
/// so this keeps a busy download from turning into a continuous rescan.
const DEBOUNCE: Duration = Duration::from_millis(200);

type Out = Arc<Mutex<std::io::Stdout>>;

fn emit(out: &Out, event: Event) {
    let mut out = out.lock().unwrap_or_else(|e| e.into_inner());
    // Parent gone: nothing useful left to do with the error.
    let _ = writeln!(out, "{}", event.to_line());
    let _ = out.flush();
}

enum Msg {
    Dirty,
    Stop,
}

fn main() {
    let out: Out = Arc::new(Mutex::new(std::io::stdout()));
    let mut watches: HashMap<String, Sender<Msg>> = HashMap::new();
    emit(&out, Event::Ready);

    // Exits when stdin closes, i.e. when the app that spawned us goes away.
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        match parse_command(&line) {
            Ok(Command::Watch { id, paths, interval_ms }) => {
                if let Some(old) = watches.remove(&id) {
                    let _ = old.send(Msg::Stop);
                }
                let (tx, rx) = mpsc::channel();
                let out = out.clone();
                let thread_tx = tx.clone();
                let thread_id = id.clone();
                thread::spawn(move || {
                    watch_loop(&out, thread_id, paths, Duration::from_millis(interval_ms.max(50)), thread_tx, rx)
                });
                watches.insert(id, tx);
            }
            Ok(Command::Unwatch { id }) => {
                if let Some(tx) = watches.remove(&id) {
                    let _ = tx.send(Msg::Stop);
                }
            }
            Ok(Command::Size { id, path }) => {
                let out = out.clone();
                thread::spawn(move || {
                    let Totals { bytes, files } = measure(&path);
                    emit(&out, Event::Size { id, bytes, files });
                });
            }
            Err(message) => emit(&out, Event::Error { id: None, message }),
        }
    }
}

fn watch_loop(
    out: &Out,
    id: String,
    paths: Vec<PathBuf>,
    interval: Duration,
    tx: Sender<Msg>,
    rx: mpsc::Receiver<Msg>,
) {
    // notify is only a trigger for faster rescans; polling every `interval` is what guarantees
    // progress, including for paths that don't exist yet or volumes where events don't arrive.
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = tx.send(Msg::Dirty);
        }
    })
    .ok();
    let mut watched: HashSet<PathBuf> = HashSet::new();

    let mut last: Option<Totals> = None;
    let mut last_scan = Instant::now() - interval;
    let mut dirty = true;

    loop {
        if let Some(w) = watcher.as_mut() {
            for path in &paths {
                if !watched.contains(path) && path.exists() && w.watch(path, RecursiveMode::Recursive).is_ok() {
                    watched.insert(path.clone());
                }
            }
        }

        let since = last_scan.elapsed();
        if (dirty && since >= DEBOUNCE) || since >= interval {
            let totals = measure_all(&paths);
            if last != Some(totals) {
                emit(out, Event::Size { id: id.clone(), bytes: totals.bytes, files: totals.files });
                last = Some(totals);
            }
            last_scan = Instant::now();
            dirty = false;
        }

        let since = last_scan.elapsed();
        let wait = if dirty { DEBOUNCE.saturating_sub(since) } else { interval.saturating_sub(since) };
        match rx.recv_timeout(wait) {
            Ok(Msg::Dirty) => dirty = true,
            Ok(Msg::Stop) | Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {}
        }
    }
}
