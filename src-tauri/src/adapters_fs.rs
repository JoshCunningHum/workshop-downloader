//! `read_files`: reads small text files under a root folder for the adapter engine (version
//! files, About.xml, ...). Bounded in file count and size, and never leaves `root`.

use crate::error::{Error, Result};
use serde::Serialize;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

const MAX_FILES: usize = 50;
const MAX_BYTES_CAP: u64 = 1024 * 1024;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    /// Relative to root, with `/` separators.
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

pub fn read(root: &Path, globs: &[String], max_bytes: u64) -> Result<Vec<FileContent>> {
    let max_bytes = max_bytes.min(MAX_BYTES_CAP);
    // dunce: plain `C:\...` paths on Windows. std's `\\?\C:\...` (verbatim) form can't be used as
    // the base of a glob pattern; nothing would ever match.
    let root = dunce::canonicalize(root).map_err(|e| Error::msg(format!("{}: {e}", root.display())))?;
    let options = glob::MatchOptions { case_sensitive: false, require_literal_separator: true, ..Default::default() };
    let mut out: Vec<FileContent> = vec![];

    for pattern in globs {
        let rel = Path::new(pattern);
        // `has_root` also catches "/etc/hosts" on Windows, which isn't absolute there (no drive).
        if rel.is_absolute() || rel.has_root() || rel.components().any(|c| matches!(c, Component::ParentDir | Component::Prefix(_))) {
            return Err(Error::msg(format!("glob {pattern:?} must be relative to the root, without '..'")));
        }
        let full = format!("{}/{}", glob::Pattern::escape(&root.to_string_lossy()), pattern.replace('\\', "/"));
        let paths = glob::glob_with(&full, options).map_err(|e| Error::msg(format!("bad glob {pattern:?}: {e}")))?;
        for path in paths.flatten() {
            if out.len() >= MAX_FILES {
                return Ok(out);
            }
            // Resolve links so a symlink inside the item can't point the read outside root.
            let Ok(real) = dunce::canonicalize(&path) else { continue };
            if !real.starts_with(&root) || !real.is_file() {
                continue;
            }
            let rel = relative(&root, &real);
            if out.iter().any(|f| f.path == rel) {
                continue;
            }
            let mut buf = vec![];
            std::fs::File::open(&real)?.take(max_bytes + 1).read_to_end(&mut buf)?;
            let truncated = buf.len() as u64 > max_bytes;
            buf.truncate(max_bytes as usize);
            out.push(FileContent { path: rel, content: String::from_utf8_lossy(&buf).into_owned(), truncated });
        }
    }
    Ok(out)
}

fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

#[tauri::command]
pub async fn read_files(root: PathBuf, globs: Vec<String>, max_bytes: Option<u64>) -> Result<Vec<FileContent>> {
    tokio::task::spawn_blocking(move || read(&root, &globs, max_bytes.unwrap_or(256 * 1024)))
        .await
        .map_err(|e| Error::msg(e.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn reads_matching_files_case_insensitively_and_truncates() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("About")).unwrap();
        fs::write(dir.path().join("About/About.xml"), "<x/>").unwrap();
        fs::write(dir.path().join("Version.txt"), "1.5.4104 rev435").unwrap();

        let files = read(dir.path(), &["about/about.xml".into(), "Version.txt".into()], 3).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "About/About.xml");
        assert_eq!((files[1].content.as_str(), files[1].truncated), ("1.5", true));
    }

    #[test]
    fn refuses_to_leave_root() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("root")).unwrap();
        fs::write(dir.path().join("secret"), "s").unwrap();
        assert!(read(&dir.path().join("root"), &["../secret".into()], 10).is_err());
        assert!(read(&dir.path().join("root"), &["/etc/hosts".into()], 10).is_err());

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(dir.path().join("secret"), dir.path().join("root/link")).unwrap();
            assert!(read(&dir.path().join("root"), &["link".into()], 10).unwrap().is_empty());
        }
    }
}
