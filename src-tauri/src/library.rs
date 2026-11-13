//! Snapshot storage: `<library>/<appId>/<itemId>/<time_updated>/`. Staging lives under
//! `<library>/.staging/<jobId>` so finishing a download is a same-volume rename.

use crate::error::{Error, Result};
use crate::sidecar::{SidecarHost, Totals};
use std::path::{Path, PathBuf};
use tauri::State;

pub fn staging_dir(library: &Path, job_id: &str) -> PathBuf {
    library.join(".staging").join(job_id)
}

pub fn snapshot_dir(library: &Path, app_id: u32, item_id: &str, time_updated: i64) -> PathBuf {
    library.join(app_id.to_string()).join(item_id).join(time_updated.to_string())
}

/// Moves a finished download into place, replacing an existing copy of the same revision.
pub fn move_into(src: &Path, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if dest.exists() {
        // Same revision downloaded again (e.g. re-validate): swap so a failure keeps the old copy.
        let old = dest.with_extension("old");
        let _ = std::fs::remove_dir_all(&old);
        std::fs::rename(dest, &old)?;
        if let Err(e) = rename_or_copy(src, dest) {
            let _ = std::fs::rename(&old, dest);
            return Err(e);
        }
        let _ = std::fs::remove_dir_all(&old);
        return Ok(());
    }
    rename_or_copy(src, dest)
}

pub(crate) fn rename_or_copy(src: &Path, dest: &Path) -> Result<()> {
    match std::fs::rename(src, dest) {
        Ok(()) => Ok(()),
        // Different volumes (shouldn't happen with staging inside the library, but a user can
        // point the library at a symlinked folder): fall back to copy + delete.
        Err(_) => {
            crate::steamcmd::pool::copy_dir(src, dest)?;
            std::fs::remove_dir_all(src)?;
            Ok(())
        }
    }
}

/// Fails unless `path` is strictly inside `library` (after resolving `..` and links).
pub fn ensure_inside(library: &Path, path: &Path) -> Result<PathBuf> {
    let library = dunce_canonical(library)?;
    let path = dunce_canonical(path)?;
    if path != library && path.starts_with(&library) {
        Ok(path)
    } else {
        Err(Error::msg(format!("{} is not inside the library {}", path.display(), library.display())))
    }
}

/// `canonicalize` on Windows returns `\\?\` paths; that's fine for comparisons and file ops.
fn dunce_canonical(path: &Path) -> Result<PathBuf> {
    std::fs::canonicalize(path).map_err(|e| Error::msg(format!("{}: {e}", path.display())))
}

#[tauri::command]
pub async fn snapshot_delete(library_path: PathBuf, path: PathBuf) -> Result<()> {
    let path = ensure_inside(&library_path, &path)?;
    tokio::fs::remove_dir_all(&path).await?;
    // Tidy empty <item> / <app> folders left behind.
    let mut parent = path.parent().map(Path::to_path_buf);
    while let Some(dir) = parent {
        if ensure_inside(&library_path, &dir).is_err() || std::fs::remove_dir(&dir).is_err() {
            break;
        }
        parent = dir.parent().map(Path::to_path_buf);
    }
    Ok(())
}

#[tauri::command]
pub async fn snapshot_size(host: State<'_, SidecarHost>, path: PathBuf) -> Result<Totals> {
    host.size(path).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn move_into_replaces_same_revision() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("staging/content/1");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("new"), "n").unwrap();
        let dest = snapshot_dir(dir.path(), 10, "1", 100);
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("old"), "o").unwrap();

        move_into(&src, &dest).unwrap();
        assert!(dest.join("new").exists());
        assert!(!dest.join("old").exists());
        assert!(!src.exists());
    }

    #[test]
    fn ensure_inside_rejects_outside_and_root() {
        let dir = tempfile::tempdir().unwrap();
        let lib = dir.path().join("lib");
        fs::create_dir_all(lib.join("10/1/100")).unwrap();
        fs::create_dir_all(dir.path().join("other")).unwrap();

        assert!(ensure_inside(&lib, &lib.join("10/1/100")).is_ok());
        assert!(ensure_inside(&lib, &lib).is_err());
        assert!(ensure_inside(&lib, &dir.path().join("other")).is_err());
        assert!(ensure_inside(&lib, &lib.join("10/../../other")).is_err());
    }
}
