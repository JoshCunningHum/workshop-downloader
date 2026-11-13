//! Links from a game's mod folder to the active snapshot.
//! Windows: directory junctions by default (no admin / Developer Mode needed), or real directory
//! symlinks (need Developer Mode or admin). Unix (macOS dev): symlinks.
//!
//! Safety rule: we only ever replace or remove something that is a link *and* points into the
//! library. A real folder at the link path is never touched.

use crate::error::{Error, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LinkMode {
    Junction,
    Symlink,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LinkStatus {
    /// Link exists and points at the expected snapshot.
    Ok,
    /// Nothing at the link path.
    Missing,
    /// Link exists but its target is gone.
    Broken,
    /// Link points somewhere other than the expected snapshot.
    Drifted,
    /// A real file or folder sits at the link path.
    NotLink,
}

/// Where the link at `path` points, or None if `path` isn't a link.
pub fn link_target(path: &Path) -> Option<PathBuf> {
    let meta = std::fs::symlink_metadata(path).ok()?;
    #[cfg(windows)]
    if junction::exists(path).unwrap_or(false) {
        return junction::get_target(path).ok();
    }
    if meta.file_type().is_symlink() { std::fs::read_link(path).ok() } else { None }
}

/// Comparable form of a path: no `\\?\` prefix, `/` separators, and lowercase on Windows
/// (NTFS is case-insensitive), with trailing separators removed.
fn normalize(path: &Path) -> String {
    let s = path.to_string_lossy();
    let s = s.strip_prefix(r"\\?\").unwrap_or(&s).replace('\\', "/");
    let s = s.trim_end_matches('/').to_string();
    if cfg!(windows) { s.to_lowercase() } else { s }
}

fn same_path(a: &Path, b: &Path) -> bool {
    normalize(a) == normalize(b)
}

fn is_inside(path: &Path, root: &Path) -> bool {
    if path.components().any(|c| c == std::path::Component::ParentDir) {
        return false;
    }
    let (path, root) = (normalize(path), normalize(root));
    path.len() > root.len() && path.starts_with(&root) && path.as_bytes()[root.len()] == b'/'
}

fn exists_or_dangling(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok()
}

/// Removes the link at `link` if it is one of ours (a link into `library`).
pub fn remove(link: &Path, library: &Path) -> Result<()> {
    if !exists_or_dangling(link) {
        return Ok(());
    }
    let Some(target) = link_target(link) else {
        return Err(Error::msg(format!("{} is a real file or folder, not a link; leaving it alone", link.display())));
    };
    if !is_inside(&target, library) {
        return Err(Error::msg(format!(
            "{} links to {}, outside the library; leaving it alone",
            link.display(),
            target.display()
        )));
    }
    remove_link(link)
}

fn remove_link(link: &Path) -> Result<()> {
    // Removing a junction/symlink this way deletes only the link, never the target's contents.
    #[cfg(windows)]
    std::fs::remove_dir(link).or_else(|_| std::fs::remove_file(link))?;
    #[cfg(unix)]
    std::fs::remove_file(link)?;
    Ok(())
}

/// Creates (or re-points) `link` -> `target`. `target` must be a folder inside `library`.
pub fn create(link: &Path, target: &Path, mode: LinkMode, library: &Path) -> Result<()> {
    if !target.is_dir() {
        return Err(Error::msg(format!("snapshot folder {} does not exist", target.display())));
    }
    // Canonical check resolves `..` and links in the target before trusting it.
    crate::library::ensure_inside(library, target)?;
    if !link.is_absolute() {
        return Err(Error::msg("link path must be absolute"));
    }
    remove(link, library)?;
    if let Some(parent) = link.parent() {
        std::fs::create_dir_all(parent)?;
    }
    make_link(target, link, mode)
}

#[cfg(windows)]
fn make_link(target: &Path, link: &Path, mode: LinkMode) -> Result<()> {
    match mode {
        LinkMode::Junction => junction::create(target, link).map_err(|e| {
            Error::msg(format!("could not create junction (both folders must be on local NTFS drives): {e}"))
        }),
        LinkMode::Symlink => std::os::windows::fs::symlink_dir(target, link).map_err(|e| {
            Error::msg(format!("could not create symlink (needs Developer Mode or admin): {e}"))
        }),
    }
}

#[cfg(unix)]
fn make_link(target: &Path, link: &Path, _mode: LinkMode) -> Result<()> {
    // Junctions are Windows-only; the macOS dev build always uses symlinks.
    std::os::unix::fs::symlink(target, link)?;
    Ok(())
}

pub fn status(link: &Path, expected: &Path) -> LinkStatus {
    if !exists_or_dangling(link) {
        return LinkStatus::Missing;
    }
    match link_target(link) {
        None => LinkStatus::NotLink,
        Some(target) if !same_path(&target, expected) => LinkStatus::Drifted,
        Some(target) if !target.is_dir() => LinkStatus::Broken,
        Some(_) => LinkStatus::Ok,
    }
}

// --- commands ---

#[tauri::command]
pub fn link_create(link_path: PathBuf, target: PathBuf, mode: LinkMode, library_path: PathBuf) -> Result<()> {
    create(&link_path, &target, mode, &library_path)
}

#[tauri::command]
pub fn link_remove(link_path: PathBuf, library_path: PathBuf) -> Result<()> {
    remove(&link_path, &library_path)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkCheck {
    id: i64,
    link_path: PathBuf,
    expected_target: PathBuf,
}

#[derive(Serialize)]
pub struct LinkCheckResult {
    id: i64,
    status: LinkStatus,
}

#[tauri::command]
pub fn links_verify(links: Vec<LinkCheck>) -> Vec<LinkCheckResult> {
    links
        .into_iter()
        .map(|l| LinkCheckResult { id: l.id, status: status(&l.link_path, &l.expected_target) })
        .collect()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::fs;

    struct Fixture {
        _dir: tempfile::TempDir,
        lib: PathBuf,
        mods: PathBuf,
        v1: PathBuf,
        v2: PathBuf,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let lib = dir.path().join("lib");
        let mods = dir.path().join("game/Mods");
        let v1 = lib.join("10/1/100");
        let v2 = lib.join("10/1/200");
        fs::create_dir_all(&v1).unwrap();
        fs::create_dir_all(&v2).unwrap();
        fs::write(v1.join("file"), "1").unwrap();
        Fixture { _dir: dir, lib, mods, v1, v2 }
    }

    #[test]
    fn creates_and_switches_versions() {
        let f = fixture();
        let link = f.mods.join("1");
        create(&link, &f.v1, LinkMode::Symlink, &f.lib).unwrap();
        assert_eq!(status(&link, &f.v1), LinkStatus::Ok);
        assert!(link.join("file").exists());

        create(&link, &f.v2, LinkMode::Symlink, &f.lib).unwrap();
        assert_eq!(status(&link, &f.v2), LinkStatus::Ok);
        assert_eq!(status(&link, &f.v1), LinkStatus::Drifted);
        assert!(f.v1.join("file").exists(), "switching must not touch the old snapshot");

        remove(&link, &f.lib).unwrap();
        assert_eq!(status(&link, &f.v2), LinkStatus::Missing);
        assert!(f.v2.exists());
    }

    #[test]
    fn never_replaces_a_real_folder() {
        let f = fixture();
        let link = f.mods.join("1");
        fs::create_dir_all(&link).unwrap();
        fs::write(link.join("precious"), "x").unwrap();

        assert!(create(&link, &f.v1, LinkMode::Symlink, &f.lib).is_err());
        assert!(remove(&link, &f.lib).is_err());
        assert!(link.join("precious").exists());
        assert_eq!(status(&link, &f.v1), LinkStatus::NotLink);
    }

    #[test]
    fn never_removes_foreign_links_or_links_outside_library() {
        let f = fixture();
        let elsewhere = f.mods.parent().unwrap().join("elsewhere");
        fs::create_dir_all(&elsewhere).unwrap();
        fs::create_dir_all(&f.mods).unwrap();
        let link = f.mods.join("1");
        std::os::unix::fs::symlink(&elsewhere, &link).unwrap();

        assert!(remove(&link, &f.lib).is_err());
        assert!(create(&link, &f.v1, LinkMode::Symlink, &f.lib).is_err());
        assert!(create(&f.mods.join("2"), &elsewhere, LinkMode::Symlink, &f.lib).is_err());
    }

    #[test]
    fn reports_broken_links() {
        let f = fixture();
        let link = f.mods.join("1");
        create(&link, &f.v2, LinkMode::Symlink, &f.lib).unwrap();
        fs::remove_dir_all(&f.v2).unwrap();
        assert_eq!(status(&link, &f.v2), LinkStatus::Broken);
        // A dangling link of ours can still be cleaned up.
        remove(&link, &f.lib).unwrap();
        assert_eq!(status(&link, &f.v2), LinkStatus::Missing);
    }

    #[test]
    fn library_prefix_is_not_enough() {
        assert!(!is_inside(Path::new("/lib-other/x"), Path::new("/lib")));
        assert!(is_inside(Path::new("/lib/x"), Path::new("/lib/")));
        assert!(!is_inside(Path::new("/lib"), Path::new("/lib")));
        assert!(!is_inside(Path::new("/lib/../etc"), Path::new("/lib")));
    }
}
