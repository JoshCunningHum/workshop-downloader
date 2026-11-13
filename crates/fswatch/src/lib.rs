//! fswatch: measures folder sizes and reports them as NDJSON.
//!
//! Protocol (one JSON object per line):
//!
//! stdin:
//! - `{"op":"watch","id":"job-12","paths":[...],"intervalMs":500}`
//! - `{"op":"unwatch","id":"job-12"}`
//! - `{"op":"size","id":"req-1","path":"..."}`
//!
//! stdout:
//! - `{"event":"ready"}`
//! - `{"id":"job-12","event":"size","bytes":123,"files":45}`
//! - `{"id":"job-12","event":"error","message":"..."}` (`id` is absent for protocol errors)
//!
//! Paths that don't exist yet count as 0 bytes, so a watch can start before SteamCMD creates
//! its download folder.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Command {
    #[serde(rename_all = "camelCase")]
    Watch {
        id: String,
        paths: Vec<PathBuf>,
        #[serde(default = "default_interval")]
        interval_ms: u64,
    },
    Unwatch {
        id: String,
    },
    Size {
        id: String,
        path: PathBuf,
    },
}

fn default_interval() -> u64 {
    500
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum Event {
    Ready,
    Size {
        id: String,
        bytes: u64,
        files: u64,
    },
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Option<String>,
        message: String,
    },
}

impl Event {
    pub fn to_line(&self) -> String {
        serde_json::to_string(self).expect("events always serialize")
    }
}

pub fn parse_command(line: &str) -> Result<Command, String> {
    serde_json::from_str(line).map_err(|e| format!("invalid command: {e}"))
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Totals {
    pub bytes: u64,
    pub files: u64,
}

/// Sums the size and file count of everything under `path`. A single file counts as itself,
/// a missing path as zero. Entries that vanish mid-walk (SteamCMD moves files around) are skipped.
pub fn measure(path: &Path) -> Totals {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return Totals::default();
    };
    if meta.is_file() {
        return Totals { bytes: meta.len(), files: 1 };
    }
    if !meta.is_dir() {
        return Totals::default();
    }

    let mut totals = Totals::default();
    for entry in jwalk::WalkDir::new(path).skip_hidden(false).follow_links(false).into_iter().flatten() {
        if !entry.file_type().is_file() {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            totals.bytes += meta.len();
            totals.files += 1;
        }
    }
    totals
}

pub fn measure_all(paths: &[PathBuf]) -> Totals {
    paths.iter().map(|p| measure(p)).fold(Totals::default(), |acc, t| Totals {
        bytes: acc.bytes + t.bytes,
        files: acc.files + t.files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parses_commands() {
        assert_eq!(
            parse_command(r#"{"op":"watch","id":"a","paths":["/x"],"intervalMs":250}"#).unwrap(),
            Command::Watch { id: "a".into(), paths: vec!["/x".into()], interval_ms: 250 }
        );
        assert_eq!(
            parse_command(r#"{"op":"watch","id":"a","paths":[]}"#).unwrap(),
            Command::Watch { id: "a".into(), paths: vec![], interval_ms: 500 }
        );
        assert_eq!(parse_command(r#"{"op":"unwatch","id":"a"}"#).unwrap(), Command::Unwatch { id: "a".into() });
        assert!(parse_command(r#"{"op":"nope"}"#).is_err());
        assert!(parse_command("not json").is_err());
    }

    #[test]
    fn serializes_events() {
        assert_eq!(Event::Ready.to_line(), r#"{"event":"ready"}"#);
        assert_eq!(
            Event::Size { id: "a".into(), bytes: 3, files: 1 }.to_line(),
            r#"{"event":"size","id":"a","bytes":3,"files":1}"#
        );
        assert_eq!(
            Event::Error { id: None, message: "x".into() }.to_line(),
            r#"{"event":"error","message":"x"}"#
        );
    }

    #[test]
    fn measures_trees_files_and_missing_paths() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("a/b")).unwrap();
        fs::write(dir.path().join("a/one"), [0u8; 10]).unwrap();
        fs::write(dir.path().join("a/b/two"), [0u8; 5]).unwrap();
        fs::write(dir.path().join(".hidden"), [0u8; 1]).unwrap();

        assert_eq!(measure(dir.path()), Totals { bytes: 16, files: 3 });
        assert_eq!(measure(&dir.path().join("a/one")), Totals { bytes: 10, files: 1 });
        assert_eq!(measure(&dir.path().join("missing")), Totals::default());
        assert_eq!(
            measure_all(&[dir.path().join("a"), dir.path().join("missing")]),
            Totals { bytes: 15, files: 2 }
        );
    }
}
