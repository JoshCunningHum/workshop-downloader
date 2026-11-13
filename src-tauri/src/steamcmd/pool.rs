//! Worker slots. Each slot gets its own SteamCMD folder (`steamcmd/worker-{i}`) cloned from
//! `base`, on the assumption (to verify on Windows) that instances can't share one install.

use super::install::{EXE, base_dir};
use crate::error::Result;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

pub const MAX_WORKERS: usize = 16;

struct State {
    size: usize,
    busy: [bool; MAX_WORKERS],
}

pub struct WorkerPool {
    root: PathBuf,
    state: Mutex<State>,
    freed: Notify,
}

/// A held worker slot; released on drop.
pub struct Slot {
    pub index: usize,
    pool: Arc<WorkerPool>,
}

impl Drop for Slot {
    fn drop(&mut self) {
        self.pool.state.lock().unwrap_or_else(|e| e.into_inner()).busy[self.index] = false;
        self.pool.freed.notify_waiters();
    }
}

impl Slot {
    pub fn dir(&self) -> PathBuf {
        worker_dir(&self.pool.root, self.index)
    }
}

pub fn worker_dir(root: &Path, index: usize) -> PathBuf {
    root.join(format!("worker-{index}"))
}

impl WorkerPool {
    pub fn new(root: PathBuf, size: usize) -> Arc<Self> {
        Arc::new(WorkerPool {
            root,
            state: Mutex::new(State { size: size.clamp(1, MAX_WORKERS), busy: [false; MAX_WORKERS] }),
            freed: Notify::new(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn size(&self) -> usize {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).size
    }

    /// Shrinking takes effect as running jobs finish; it never interrupts them.
    pub fn resize(&self, size: usize) {
        self.state.lock().unwrap_or_else(|e| e.into_inner()).size = size.clamp(1, MAX_WORKERS);
        self.freed.notify_waiters();
    }

    fn try_take(&self) -> Option<usize> {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let running = state.busy.iter().filter(|b| **b).count();
        if running >= state.size {
            return None;
        }
        let index = (0..state.size).find(|i| !state.busy[*i])?;
        state.busy[index] = true;
        Some(index)
    }

    pub async fn acquire(self: &Arc<Self>) -> Slot {
        loop {
            let freed = self.freed.notified();
            tokio::pin!(freed);
            // Register interest before checking, so a release between check and await isn't missed.
            freed.as_mut().enable();
            if let Some(index) = self.try_take() {
                return Slot { index, pool: self.clone() };
            }
            freed.await;
        }
    }

    /// Clones `base` into the slot's folder the first time it's used.
    pub async fn prepare(&self, slot: &Slot) -> Result<PathBuf> {
        let dir = slot.dir();
        if !dir.join(EXE).is_file() {
            let base = base_dir(&self.root);
            let dest = dir.clone();
            tokio::task::spawn_blocking(move || copy_dir(&base, &dest))
                .await
                .map_err(|e| crate::error::Error::msg(e.to_string()))??;
        }
        Ok(dir)
    }
}

pub fn copy_dir(src: &Path, dest: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dest.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else if kind.is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(std::fs::read_link(entry.path())?, &target)?;
            #[cfg(windows)]
            std::fs::copy(entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn hands_out_distinct_slots_up_to_size() {
        let pool = WorkerPool::new(PathBuf::from("/unused"), 2);
        let a = pool.acquire().await;
        let b = pool.acquire().await;
        assert_ne!(a.index, b.index);

        let waiting = tokio::spawn({
            let pool = pool.clone();
            async move { pool.acquire().await.index }
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(!waiting.is_finished());

        let freed = a.index;
        drop(a);
        assert_eq!(tokio::time::timeout(Duration::from_secs(1), waiting).await.unwrap().unwrap(), freed);
    }

    #[tokio::test]
    async fn growing_releases_waiters() {
        let pool = WorkerPool::new(PathBuf::from("/unused"), 1);
        let _a = pool.acquire().await;
        let waiting = tokio::spawn({
            let pool = pool.clone();
            async move { pool.acquire().await.index }
        });
        tokio::time::sleep(Duration::from_millis(20)).await;
        pool.resize(2);
        assert_eq!(tokio::time::timeout(Duration::from_secs(1), waiting).await.unwrap().unwrap(), 1);
    }
}
