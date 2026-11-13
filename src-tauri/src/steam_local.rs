//! Finds the local Steam install, its library folders and installed games (install folder and
//! buildid), from `libraryfolders.vdf` and `appmanifest_<appid>.acf`.

use crate::error::Result;
use keyvalues_parser::Value;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    pub app_id: u32,
    pub name: String,
    pub install_path: PathBuf,
    pub build_id: Option<String>,
}

#[cfg(windows)]
pub fn steam_root() -> Option<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::HKEY_CURRENT_USER;
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Valve\Steam").ok()?;
    let path: String = key.get_value("SteamPath").ok()?;
    // SteamPath is stored with forward slashes.
    Some(PathBuf::from(path.replace('/', "\\"))).filter(|p| p.is_dir())
}

#[cfg(target_os = "macos")]
pub fn steam_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(Path::new(&home).join("Library/Application Support/Steam")).filter(|p| p.is_dir())
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn steam_root() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    [".steam/steam", ".local/share/Steam"].iter().map(|p| Path::new(&home).join(p)).find(|p| p.is_dir())
}

/// VDF keys are case-insensitive in practice ("LibraryFolders" vs "libraryfolders").
fn get<'a>(value: &'a Value, key: &str) -> Option<&'a Value<'a>> {
    value.get_obj()?.iter().find(|(k, _)| k.eq_ignore_ascii_case(key)).and_then(|(_, v)| v.first())
}

fn get_str<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    get(value, key)?.get_str()
}

/// Library folder paths listed in `libraryfolders.vdf` (new object format and the old
/// `"1" "D:\\Games"` format).
pub fn parse_library_folders(text: &str) -> Vec<PathBuf> {
    let Ok(vdf) = keyvalues_parser::parse(text) else { return vec![] };
    let Some(obj) = vdf.value.get_obj() else { return vec![] };
    obj.iter()
        .filter(|(k, _)| k.chars().all(|c| c.is_ascii_digit()))
        .filter_map(|(_, values)| {
            let v = values.first()?;
            v.get_str().or_else(|| get_str(v, "path")).map(PathBuf::from)
        })
        .collect()
}

pub fn parse_app_manifest(text: &str, library: &Path) -> Option<InstalledGame> {
    let vdf = keyvalues_parser::parse(text).ok()?;
    let state = &vdf.value;
    let app_id = get_str(state, "appid")?.parse().ok()?;
    let install_dir = get_str(state, "installdir")?;
    Some(InstalledGame {
        app_id,
        name: get_str(state, "name").unwrap_or_default().to_string(),
        install_path: library.join("steamapps").join("common").join(install_dir),
        build_id: get_str(state, "buildid").map(str::to_string),
    })
}

pub fn libraries(root: &Path) -> Vec<PathBuf> {
    let mut libs = vec![root.to_path_buf()];
    if let Ok(text) = std::fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
        for lib in parse_library_folders(&text) {
            if !libs.iter().any(|l| l == &lib) {
                libs.push(lib);
            }
        }
    }
    libs
}

pub fn installed_games() -> Vec<InstalledGame> {
    let Some(root) = steam_root() else { return vec![] };
    let mut games = vec![];
    for lib in libraries(&root) {
        let Ok(entries) = std::fs::read_dir(lib.join("steamapps")) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("appmanifest_") && name.ends_with(".acf")
                && let Ok(text) = std::fs::read_to_string(entry.path())
                && let Some(game) = parse_app_manifest(&text, &lib)
            {
                games.push(game);
            }
        }
    }
    games.sort_by_key(|g| g.name.to_lowercase());
    games
}

#[tauri::command]
pub fn steam_installed_games() -> Vec<InstalledGame> {
    installed_games()
}

#[tauri::command]
pub fn steam_installed_game(app_id: u32) -> Option<InstalledGame> {
    installed_games().into_iter().find(|g| g.app_id == app_id)
}

#[tauri::command]
pub fn steam_root_path() -> Result<Option<PathBuf>> {
    Ok(steam_root())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_new_library_folders_format() {
        let text = r#"
"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"apps" { "228980" "1234" }
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
        assert_eq!(
            parse_library_folders(text),
            vec![PathBuf::from(r"C:\Program Files (x86)\Steam"), PathBuf::from(r"D:\SteamLibrary")]
        );
    }

    #[test]
    fn parses_old_library_folders_format() {
        let text = r#""LibraryFolders" { "TimeNextStatsReport" "1" "ContentStatsID" "-1" "1" "E:\\Games" }"#;
        assert_eq!(parse_library_folders(text), vec![PathBuf::from(r"E:\Games")]);
    }

    #[test]
    fn parses_app_manifest() {
        let text = r#"
"AppState"
{
	"appid"		"294100"
	"Universe"		"1"
	"name"		"RimWorld"
	"StateFlags"		"4"
	"installdir"		"RimWorld"
	"buildid"		"15500000"
}"#;
        let game = parse_app_manifest(text, Path::new("/lib")).unwrap();
        assert_eq!(game.app_id, 294100);
        assert_eq!(game.name, "RimWorld");
        assert_eq!(game.install_path, Path::new("/lib/steamapps/common/RimWorld"));
        assert_eq!(game.build_id.as_deref(), Some("15500000"));
    }
}
