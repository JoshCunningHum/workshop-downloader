//! Steam account passwords live in the OS keyring (Windows Credential Manager, macOS
//! Keychain), keyed by username. The database only stores usernames.

use crate::error::Result;

const SERVICE: &str = "com.kenshi.workshopdownloader.steam";

fn entry(username: &str) -> Result<keyring::Entry> {
    Ok(keyring::Entry::new(SERVICE, username)?)
}

pub fn password(username: &str) -> Result<Option<String>> {
    match entry(username)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub fn account_set_password(username: String, password: String) -> Result<()> {
    Ok(entry(&username)?.set_password(&password)?)
}

#[tauri::command]
pub fn account_has_password(username: String) -> Result<bool> {
    Ok(password(&username)?.is_some())
}

#[tauri::command]
pub fn account_delete_password(username: String) -> Result<()> {
    match entry(&username)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
