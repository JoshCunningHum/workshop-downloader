//! Recognizes the SteamCMD output lines the job runner acts on. Anything else is just logged.

use regex::Regex;
use serde::Serialize;
use std::sync::LazyLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum GuardKind {
    /// Code sent by email ("Steam Guard code:").
    Email,
    /// Code from the mobile authenticator ("Two-factor code:").
    TwoFactor,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Line {
    ItemSuccess { item_id: String, path: String, bytes: u64 },
    ItemFailed { item_id: String, reason: String },
    LoginOk,
    LoginFailed { reason: String },
    GuardPrompt(GuardKind),
    RateLimited,
    Other,
}

static ANSI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[A-Za-z]").unwrap());
static SUCCESS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"^Success\. Downloaded item (\d+) to "(.*)" \((\d+) bytes\)"#).unwrap());
static FAILED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^ERROR! Download item (\d+) failed \((.+?)\)").unwrap());
static TIMEOUT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^ERROR! Timeout downloading item (\d+)").unwrap());
static LOGIN_OK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^Logging in user .*\.\.\.OK\s*$").unwrap());
static LOGIN_FAILED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:\.\.\.FAILED \((.+)\)|FAILED login with result code (.+))\s*$").unwrap());

pub fn strip_ansi(line: &str) -> String {
    ANSI.replace_all(line, "").into_owned()
}

/// Parses one complete output line (without its line ending).
pub fn parse_line(raw: &str) -> Line {
    let line = strip_ansi(raw);
    let line = line.trim();

    if let Some(prompt) = guard_prompt(line) {
        return Line::GuardPrompt(prompt);
    }
    if let Some(c) = SUCCESS.captures(line) {
        return Line::ItemSuccess { item_id: c[1].into(), path: c[2].into(), bytes: c[3].parse().unwrap_or(0) };
    }
    if let Some(c) = FAILED.captures(line) {
        return Line::ItemFailed { item_id: c[1].into(), reason: c[2].into() };
    }
    if let Some(c) = TIMEOUT.captures(line) {
        return Line::ItemFailed { item_id: c[1].into(), reason: "Timeout".into() };
    }
    if LOGIN_OK.is_match(line) {
        return Line::LoginOk;
    }
    if let Some(c) = LOGIN_FAILED.captures(line) {
        let reason = c.get(1).or_else(|| c.get(2)).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        if reason.contains("Rate Limit") {
            return Line::RateLimited;
        }
        return Line::LoginFailed { reason };
    }
    Line::Other
}

/// Prompts are printed without a trailing newline, so this is also checked against the
/// unterminated tail of the output buffer.
pub fn guard_prompt(text: &str) -> Option<GuardKind> {
    if text.contains("Two-factor code:") {
        Some(GuardKind::TwoFactor)
    } else if text.contains("Steam Guard code:") {
        Some(GuardKind::Email)
    } else {
        None
    }
}

/// Login failures that mean "ask the user for a Steam Guard code and retry".
pub fn guard_needed(reason: &str) -> Option<GuardKind> {
    match reason {
        "Account Logon Denied" | "Invalid Login Auth Code" => Some(GuardKind::Email),
        "Two-factor code mismatch" | "Account Login Denied Need Two Factor" => Some(GuardKind::TwoFactor),
        _ => None,
    }
}

/// Splits a growing byte buffer into complete lines on `\n` or `\r`, leaving the
/// unterminated rest in the buffer.
pub fn drain_lines(buf: &mut Vec<u8>) -> Vec<String> {
    let mut lines = Vec::new();
    let mut start = 0;
    for (i, b) in buf.iter().enumerate() {
        if *b == b'\n' || *b == b'\r' {
            if i > start {
                lines.push(String::from_utf8_lossy(&buf[start..i]).into_owned());
            }
            start = i + 1;
        }
    }
    buf.drain(..start);
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    // Reconstructed from SteamCMD's documented/commonly reported output, not captured from a
    // live run. Replace with real captures from Windows when available (see HANDOFF.md).
    const ANON_RUN: &str = include_str!("fixtures/anonymous_two_items.log");
    const GUARD_RUN: &str = include_str!("fixtures/steam_guard_email.log");

    fn interesting(log: &str) -> Vec<Line> {
        log.lines().map(parse_line).filter(|l| *l != Line::Other).collect()
    }

    #[test]
    fn anonymous_run() {
        assert_eq!(
            interesting(ANON_RUN),
            vec![
                Line::LoginOk,
                Line::ItemSuccess {
                    item_id: "2009463077".into(),
                    path: "/lib/.staging/job-1/steamapps/workshop/content/294100/2009463077".into(),
                    bytes: 1234567
                },
                Line::ItemFailed { item_id: "1111111111".into(), reason: "Failure".into() },
                Line::ItemFailed { item_id: "2222222222".into(), reason: "Timeout".into() },
            ]
        );
    }

    #[test]
    fn steam_guard_run() {
        let lines = interesting(GUARD_RUN);
        assert_eq!(lines, vec![Line::LoginFailed { reason: "Account Logon Denied".into() }]);
        assert_eq!(guard_needed("Account Logon Denied"), Some(GuardKind::Email));
        assert_eq!(guard_needed("Invalid Password"), None);
    }

    #[test]
    fn login_failure_variants() {
        assert_eq!(
            parse_line("FAILED login with result code Invalid Password"),
            Line::LoginFailed { reason: "Invalid Password".into() }
        );
        assert_eq!(parse_line("Logging in user 'x' [U:1:0] to Steam Public...FAILED (Rate Limit Exceeded)"), Line::RateLimited);
    }

    #[test]
    fn prompts_and_ansi() {
        assert_eq!(parse_line("\x1b[0mSteam Guard code:"), Line::GuardPrompt(GuardKind::Email));
        assert_eq!(guard_prompt("Logging in...\nTwo-factor code:"), Some(GuardKind::TwoFactor));
        assert_eq!(strip_ansi("\x1b[1;31mERROR\x1b[0m"), "ERROR");
    }

    #[test]
    fn drains_lines_on_cr_and_lf() {
        let mut buf = b"one\r\ntwo\rthree\nfour".to_vec();
        assert_eq!(drain_lines(&mut buf), vec!["one", "two", "three"]);
        assert_eq!(buf, b"four");
    }
}
