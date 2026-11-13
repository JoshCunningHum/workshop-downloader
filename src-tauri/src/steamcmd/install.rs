//! Downloads the official SteamCMD archive into `<app data>/steamcmd/base` and runs it once so
//! it self-updates. SteamCMD isn't bundled: it updates itself and needs a writable folder.

use crate::error::{Error, Result};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};

#[cfg(windows)]
pub const EXE: &str = "steamcmd.exe";
#[cfg(unix)]
pub const EXE: &str = "steamcmd.sh";

#[cfg(windows)]
const ARCHIVE_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";
#[cfg(target_os = "macos")]
const ARCHIVE_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz";
#[cfg(all(unix, not(target_os = "macos")))]
const ARCHIVE_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz";

/// Written after the first `+quit` run so a half-finished install is redone on next start.
const MARKER: &str = ".wd-bootstrapped";

pub fn base_dir(root: &Path) -> PathBuf {
    root.join("base")
}

pub fn is_installed(root: &Path) -> bool {
    let base = base_dir(root);
    base.join(EXE).is_file() && base.join(MARKER).is_file()
}

pub async fn ensure_installed(root: &Path, log: &(dyn Fn(String) + Send + Sync)) -> Result<()> {
    if is_installed(root) {
        return Ok(());
    }
    let base = base_dir(root);
    tokio::fs::create_dir_all(&base).await?;

    if !base.join(EXE).is_file() {
        log(format!("Downloading {ARCHIVE_URL}"));
        let bytes = reqwest::get(ARCHIVE_URL).await?.error_for_status()?.bytes().await?;
        log(format!("Extracting {} bytes into {}", bytes.len(), base.display()));
        let dest = base.clone();
        tokio::task::spawn_blocking(move || extract(&bytes, &dest))
            .await
            .map_err(|e| Error::msg(e.to_string()))??;
    }

    // The first run downloads the real client and may exit non-zero after updating itself
    // (exit code 7 on Windows is commonly reported), so the exit code isn't treated as failure.
    log("Bootstrapping SteamCMD (first run self-updates, this can take a minute)".into());
    let code = run_and_log(&base, &["+quit"], log).await?;
    log(format!("SteamCMD exited with {code:?}"));
    if !base.join(EXE).is_file() {
        return Err(Error::msg("SteamCMD executable missing after bootstrap"));
    }
    tokio::fs::write(base.join(MARKER), b"").await?;
    Ok(())
}

pub async fn reinstall(root: &Path, log: &(dyn Fn(String) + Send + Sync)) -> Result<()> {
    if root.exists() {
        log(format!("Removing {}", root.display()));
        tokio::fs::remove_dir_all(root).await?;
    }
    ensure_installed(root, log).await
}

#[cfg(windows)]
fn extract(bytes: &[u8], dest: &Path) -> Result<()> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| Error::msg(e.to_string()))?;
    archive.extract(dest).map_err(|e| Error::msg(e.to_string()))
}

#[cfg(unix)]
fn extract(bytes: &[u8], dest: &Path) -> Result<()> {
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(bytes));
    archive.set_preserve_permissions(true);
    archive.unpack(dest)?;
    Ok(())
}

pub fn command(dir: &Path) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new(dir.join(EXE));
    cmd.current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: don't flash a console window per SteamCMD process.
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

async fn run_and_log(dir: &Path, args: &[&str], log: &(dyn Fn(String) + Send + Sync)) -> Result<Option<i32>> {
    let mut child = command(dir).args(args).spawn()?;
    let stdout = child.stdout.take().expect("piped");
    let stderr = child.stderr.take().expect("piped");
    let mut out = BufReader::new(stdout).lines();
    let mut err = BufReader::new(stderr).lines();
    let (mut out_done, mut err_done) = (false, false);
    while !(out_done && err_done) {
        tokio::select! {
            line = out.next_line(), if !out_done => match line? {
                Some(l) => log(super::parse::strip_ansi(&l)),
                None => out_done = true,
            },
            line = err.next_line(), if !err_done => match line? {
                Some(l) => log(super::parse::strip_ansi(&l)),
                None => err_done = true,
            },
        }
    }
    Ok(child.wait().await?.code())
}
