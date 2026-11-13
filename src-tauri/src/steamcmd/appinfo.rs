//! Builds the list of apps whose dedicated servers/tools can be downloaded anonymously, the
//! same list Hermes scrapes from SteamDB (sub 17906), but asked from Steam directly:
//! `package_info_print 17906` for the app ids, then `app_info_print <id>` for names.
//!
//! Both commands print KeyValues blocks (`"<id>"` then `{` ... `}` on their own lines)
//! between ordinary log lines; [`BlockScanner`] picks those blocks out of the stream.

use keyvalues_parser::Value;
use serde::Serialize;

/// Steam's "Anonymous Dedicated Server Comp" package.
pub const ANONYMOUS_PACKAGE_ID: u32 = 17906;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    pub app_id: u32,
    pub name: Option<String>,
    /// `common.type`, e.g. "Game", "Tool", "Config".
    pub kind: Option<String>,
}

/// Collects top-level KeyValues blocks from SteamCMD output, one line at a time.
#[derive(Default)]
pub struct BlockScanner {
    key: Option<String>,
    text: String,
    depth: usize,
}

impl BlockScanner {
    /// True while inside a block, i.e. the line just pushed was part of one.
    pub fn in_block(&self) -> bool {
        self.depth > 0
    }

    /// Feeds one output line; returns `(key, block text)` when a top-level block closes.
    pub fn push(&mut self, line: &str) -> Option<(String, String)> {
        let line = line.trim();
        if self.depth == 0 {
            if line == "{" && self.key.is_some() {
                self.depth = 1;
                self.text.push_str("{\n");
                return None;
            }
            // A bare quoted key may open a block on the next line.
            self.key = quoted(line).map(str::to_owned);
            self.text = self.key.as_ref().map(|_| format!("{line}\n")).unwrap_or_default();
            return None;
        }

        self.text.push_str(line);
        self.text.push('\n');
        match line {
            "{" => self.depth += 1,
            "}" => self.depth -= 1,
            _ => {}
        }
        if self.depth > 0 {
            return None;
        }
        let key = self.key.take()?;
        Some((key, std::mem::take(&mut self.text)))
    }
}

/// `"abc"` -> `abc` for a line that is exactly one quoted string.
fn quoted(line: &str) -> Option<&str> {
    let inner = line.strip_prefix('"')?.strip_suffix('"')?;
    (!inner.is_empty() && !inner.contains('"')).then_some(inner)
}

/// VDF keys are case-insensitive in practice.
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value<'a>> {
    value.get_obj()?.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).and_then(|(_, v)| v.first())
}

/// App ids listed under `appids` in a `package_info_print` block.
pub fn package_app_ids(block: &str) -> Vec<u32> {
    let Ok(vdf) = keyvalues_parser::parse(block) else { return vec![] };
    let Some(obj) = get(&vdf.value, "appids").and_then(Value::get_obj) else { return vec![] };
    let mut ids: Vec<u32> = obj
        .values()
        .filter_map(|values| values.first()?.get_str()?.parse().ok())
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}

/// Name and type from an `app_info_print` block; `None` if the block isn't app info.
pub fn app_entry(block: &str) -> Option<AppEntry> {
    let vdf = keyvalues_parser::parse(block).ok()?;
    let app_id = vdf.key.parse().ok()?;
    let common = get(&vdf.value, "common");
    let text = |key| common.and_then(|c| get(c, key)).and_then(Value::get_str).map(str::to_owned);
    Some(AppEntry { app_id, name: text("name"), kind: text("type") })
}

/// SteamCMD script printing app info for each id, run with `+runscript`.
pub fn app_info_script(app_ids: &[u32]) -> String {
    let mut script = String::from("@ShutdownOnFailedCommand 0\n@NoPromptForPassword 1\nlogin anonymous\napp_info_update 1\n");
    for id in app_ids {
        script.push_str(&format!("app_info_print {id}\n"));
    }
    script.push_str("quit\n");
    script
}

#[cfg(test)]
mod tests {
    use super::*;

    // Reconstructed from SteamCMD's KeyValues output format, not captured from a live run.
    // Replace with real captures when available (see HANDOFF.md).
    const PACKAGE: &str = include_str!("fixtures/package_info_17906.log");
    const APPS: &str = include_str!("fixtures/app_info_two_apps.log");

    fn blocks(output: &str) -> Vec<(String, String)> {
        let mut scanner = BlockScanner::default();
        output.lines().filter_map(|l| scanner.push(l)).collect()
    }

    #[test]
    fn finds_package_app_ids_between_log_lines() {
        let found = blocks(PACKAGE);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].0, "17906");
        assert_eq!(package_app_ids(&found[0].1), vec![90, 740, 1007]);
    }

    #[test]
    fn reads_app_names_and_types() {
        let entries: Vec<_> = blocks(APPS).iter().filter_map(|(_, b)| app_entry(b)).collect();
        assert_eq!(entries, vec![
            AppEntry { app_id: 90, name: Some("Half-Life Dedicated Server".into()), kind: Some("Tool".into()) },
            AppEntry { app_id: 740, name: Some("Counter-Strike Global Offensive - Dedicated Server".into()), kind: Some("Tool".into()) },
        ]);
    }

    #[test]
    fn ignores_quoted_lines_not_followed_by_a_block() {
        assert!(blocks("\"just a line\"\nmore output\n").is_empty());
    }

    #[test]
    fn script_logs_in_and_prints_each_app() {
        let script = app_info_script(&[90, 740]);
        assert!(script.contains("login anonymous\n"));
        assert!(script.contains("app_info_print 90\napp_info_print 740\nquit\n"));
    }
}
