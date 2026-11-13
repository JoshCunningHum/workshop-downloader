//! Taking over a game's existing mods folder, laid out like Steam's workshop content folder:
//! `<mods>/<workshop item id>/`. `mods_scan` lists those folders; `mods_adopt` moves one into
//! the library as a snapshot and puts a link in its place, so the game keeps seeing it.

use crate::error::{Error, Result};
use crate::library;
use crate::links::{self, LinkMode};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Stop walking a folder for its newest modification time after this many entries.
const MAX_WALK: usize = 20_000;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FolderKind {
    /// A real folder: can be adopted.
    Folder,
    /// A link into the library: already managed.
    Library,
    /// A link pointing somewhere else: left alone.
    Link,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FoundFolder {
    pub item_id: String,
    pub path: PathBuf,
    pub kind: FolderKind,
    /// Newest modification time inside the folder, in Unix seconds.
    pub modified: Option<i64>,
}

fn is_item_id(name: &str) -> bool {
    !name.is_empty() && name != "0" && name.bytes().all(|b| b.is_ascii_digit())
}

fn secs(time: std::io::Result<std::time::SystemTime>) -> Option<i64> {
    Some(time.ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64)
}

/// Newest modification time of `dir` and anything under it (bounded walk, links not followed).
fn newest_modified(dir: &Path) -> Option<i64> {
    let mut newest = secs(std::fs::symlink_metadata(dir).and_then(|m| m.modified()));
    let mut stack = vec![dir.to_path_buf()];
    let mut seen = 0;
    while let Some(current) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else { continue };
        for entry in entries.flatten() {
            seen += 1;
            if seen > MAX_WALK {
                return newest;
            }
            let Ok(meta) = entry.metadata() else { continue };
            newest = newest.max(secs(meta.modified()));
            if meta.is_dir() {
                stack.push(entry.path());
            }
        }
    }
    newest
}

/// Folders in `mods` named like workshop item ids. Other entries are ignored.
pub fn scan(mods: &Path, library: Option<&Path>) -> Result<Vec<FoundFolder>> {
    if !mods.is_dir() {
        return Err(Error::msg(format!("{} is not a folder", mods.display())));
    }
    let mut found = vec![];
    for entry in std::fs::read_dir(mods)?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_item_id(&name) {
            continue;
        }
        let path = entry.path();
        if let Some(target) = links::link_target(&path) {
            let managed = library.is_some_and(|lib| links::is_inside(&target, lib));
            let kind = if managed { FolderKind::Library } else { FolderKind::Link };
            found.push(FoundFolder { item_id: name, path, kind, modified: None });
        } else if path.is_dir() {
            let modified = newest_modified(&path);
            found.push(FoundFolder { item_id: name, path, kind: FolderKind::Folder, modified });
        }
    }
    found.sort_by(|a, b| a.item_id.cmp(&b.item_id));
    Ok(found)
}

/// Moves the real folder `source` into the library as the snapshot of `item_id` at
/// `time_updated`, then links `source` to it. If linking fails the folder is moved back.
pub fn adopt(source: &Path, library_path: &Path, app_id: u32, item_id: &str, time_updated: i64, mode: LinkMode) -> Result<PathBuf> {
    if !source.is_absolute() {
        return Err(Error::msg("mod folder path must be absolute"));
    }
    if source.file_name().and_then(|n| n.to_str()) != Some(item_id) || !is_item_id(item_id) {
        return Err(Error::msg(format!("{} is not the folder of item {item_id}", source.display())));
    }
    if links::link_target(source).is_some() || !source.is_dir() {
        return Err(Error::msg(format!("{} is not a real folder", source.display())));
    }
    if !library_path.is_dir() {
        return Err(Error::msg(format!("library folder {} does not exist", library_path.display())));
    }
    let dest = library::snapshot_dir(library_path, app_id, item_id, time_updated);
    if dest.exists() {
        return Err(Error::msg(format!("a snapshot of this revision already exists at {}", dest.display())));
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    library::rename_or_copy(source, &dest)?;
    if let Err(e) = links::create(source, &dest, mode, library_path) {
        // Put the folder back so the game is left as it was.
        if let Err(undo) = library::rename_or_copy(&dest, source) {
            return Err(Error::msg(format!("{e}; moving the folder back also failed ({undo}), it is now at {}", dest.display())));
        }
        return Err(e);
    }
    Ok(dest)
}

// --- commands ---

#[tauri::command]
pub async fn mods_scan(mods_path: PathBuf, library_path: Option<PathBuf>) -> Result<Vec<FoundFolder>> {
    tokio::task::spawn_blocking(move || scan(&mods_path, library_path.as_deref()))
        .await
        .map_err(|e| Error::msg(e.to_string()))?
}

#[tauri::command]
pub async fn mods_adopt(
    source: PathBuf,
    library_path: PathBuf,
    app_id: u32,
    item_id: String,
    time_updated: i64,
    mode: LinkMode,
) -> Result<PathBuf> {
    tokio::task::spawn_blocking(move || adopt(&source, &library_path, app_id, &item_id, time_updated, mode))
        .await
        .map_err(|e| Error::msg(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    struct Fixture {
        _dir: tempfile::TempDir,
        lib: PathBuf,
        mods: PathBuf,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let lib = dir.path().join("library");
        let mods = dir.path().join("294100");
        fs::create_dir_all(&lib).unwrap();
        fs::create_dir_all(&mods).unwrap();
        Fixture { _dir: dir, lib, mods }
    }

    fn item(mods: &Path, id: &str) -> PathBuf {
        let path = mods.join(id);
        fs::create_dir_all(path.join("About")).unwrap();
        fs::write(path.join("About/About.xml"), "<ModMetaData/>").unwrap();
        path
    }

    #[test]
    fn scan_lists_numeric_folders_only() {
        let f = fixture();
        item(&f.mods, "222");
        item(&f.mods, "111");
        fs::create_dir_all(f.mods.join("Core")).unwrap();
        fs::create_dir_all(f.mods.join("0")).unwrap();
        fs::write(f.mods.join("333"), "a file, not a folder").unwrap();

        let found = scan(&f.mods, Some(&f.lib)).unwrap();
        let ids: Vec<_> = found.iter().map(|x| x.item_id.as_str()).collect();
        assert_eq!(ids, ["111", "222"]);
        assert!(found.iter().all(|x| x.kind == FolderKind::Folder && x.modified.is_some()));
    }

    #[cfg(unix)]
    #[test]
    fn scan_tells_library_links_from_other_links() {
        let f = fixture();
        let snapshot = f.lib.join("294100/111/1");
        fs::create_dir_all(&snapshot).unwrap();
        std::os::unix::fs::symlink(&snapshot, f.mods.join("111")).unwrap();
        let elsewhere = f._dir.path().join("elsewhere");
        fs::create_dir_all(&elsewhere).unwrap();
        std::os::unix::fs::symlink(&elsewhere, f.mods.join("222")).unwrap();

        let kinds: Vec<_> = scan(&f.mods, Some(&f.lib)).unwrap().into_iter().map(|x| x.kind).collect();
        assert_eq!(kinds, [FolderKind::Library, FolderKind::Link]);
    }

    #[test]
    fn scan_rejects_missing_folder() {
        let f = fixture();
        assert!(scan(&f.mods.join("nope"), None).is_err());
    }

    #[test]
    fn adopt_moves_into_library_and_links_back() {
        let f = fixture();
        let source = item(&f.mods, "111");

        let dest = adopt(&source, &f.lib, 294100, "111", 1700, LinkMode::Junction).unwrap();
        assert_eq!(dest, library::snapshot_dir(&f.lib, 294100, "111", 1700));
        assert!(dest.join("About/About.xml").is_file());
        assert!(links::link_target(&source).is_some());
        assert!(source.join("About/About.xml").is_file(), "game still sees the files through the link");
    }

    #[test]
    fn adopt_refuses_wrong_name_links_and_existing_snapshots() {
        let f = fixture();
        let source = item(&f.mods, "111");
        assert!(adopt(&source, &f.lib, 294100, "999", 1, LinkMode::Junction).is_err());
        assert!(adopt(Path::new("111"), &f.lib, 294100, "111", 1, LinkMode::Junction).is_err());

        fs::create_dir_all(library::snapshot_dir(&f.lib, 294100, "111", 1)).unwrap();
        assert!(adopt(&source, &f.lib, 294100, "111", 1, LinkMode::Junction).is_err());
        assert!(links::link_target(&source).is_none() && source.join("About/About.xml").is_file(), "folder untouched");

        adopt(&source, &f.lib, 294100, "111", 2, LinkMode::Junction).unwrap();
        assert!(adopt(&source, &f.lib, 294100, "111", 3, LinkMode::Junction).is_err(), "already a link");
    }
}
