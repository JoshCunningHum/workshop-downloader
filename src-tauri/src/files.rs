//! Showing a path in the system file manager (Explorer, Finder, or whatever the user made the
//! default folder handler, e.g. Total Commander). Done here rather than with the opener plugin's
//! JS `openPath`, which would need a scope letting the page open any file with its default app.

use crate::error::{Error, Result};
use std::path::{Path, PathBuf};

/// `path` itself if it exists, else its closest existing parent.
pub fn nearest_existing(path: &Path) -> Option<PathBuf> {
    path.ancestors().find(|p| p.exists()).map(Path::to_path_buf)
}

/// Opens a folder in the default file manager; for a file, reveals it in its folder. A path
/// that doesn't exist (yet) opens its closest existing parent folder.
#[tauri::command]
pub fn open_in_file_manager(path: PathBuf) -> Result<()> {
    if !path.is_absolute() {
        return Err(Error::msg(format!("{} is not an absolute path", path.display())));
    }
    let existing = nearest_existing(&path).ok_or_else(|| Error::msg(format!("{} does not exist", path.display())))?;
    let opened = if existing.is_dir() {
        tauri_plugin_opener::open_path(&existing, None::<&str>)
    } else {
        tauri_plugin_opener::reveal_item_in_dir(&existing)
    };
    opened.map_err(|e| Error::msg(format!("could not open {}: {e}", existing.display())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_the_closest_existing_parent() {
        let dir = tempfile::tempdir().unwrap();
        let mods = dir.path().join("Mods");
        std::fs::create_dir(&mods).unwrap();
        assert_eq!(nearest_existing(&mods), Some(mods.clone()));
        assert_eq!(nearest_existing(&mods.join("123/About")), Some(mods));
    }
}
