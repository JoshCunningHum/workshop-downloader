mod accounts;
mod adapters_fs;
mod error;
mod files;
mod library;
mod links;
mod mods;
mod sidecar;
mod steam_api;
mod steam_local;
mod steamcmd;
mod workshop_browser;

use std::sync::Arc;
use tauri::Manager;

/// Default number of parallel SteamCMD workers until the frontend applies the saved setting.
const DEFAULT_CONCURRENCY: usize = 3;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first. A second launch focuses the existing window instead.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // get_window, not get_webview_window: the workshop browser makes "main" a multi-webview window.
            if let Some(window) = app.get_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            let host = sidecar::SidecarHost::new(app.handle().clone());
            host.start();

            // %APPDATA%\<identifier>\steamcmd on Windows.
            let steamcmd_root = app.path().app_data_dir()?.join("steamcmd");
            let jobs = steamcmd::job::JobManager::new(steamcmd_root, host.clone(), DEFAULT_CONCURRENCY);

            app.manage(host);
            app.manage(workshop_browser::WorkshopState::default());
            app.manage::<Arc<steamcmd::job::JobManager>>(jobs);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar::fs_size,
            sidecar::fs_watch,
            sidecar::fs_unwatch,
            steamcmd::job::job_start,
            steamcmd::job::job_cancel,
            steamcmd::job::jobs_set_concurrency,
            steamcmd::job::steamcmd_status,
            steamcmd::job::steamcmd_install,
            steamcmd::job::steam_app_index,
            library::snapshot_delete,
            library::snapshot_size,
            links::link_create,
            links::link_remove,
            links::links_verify,
            mods::mods_scan,
            mods::mods_adopt,
            steam_api::steam_resolve,
            steam_api::steam_item_details,
            steam_api::steam_app_names,
            steam_api::steam_app_details,
            steam_local::steam_installed_games,
            steam_local::steam_installed_game,
            steam_local::steam_root_path,
            accounts::account_set_password,
            accounts::account_has_password,
            accounts::account_delete_password,
            adapters_fs::read_files,
            files::open_in_file_manager,
            workshop_browser::workshop_show,
            workshop_browser::workshop_set_bounds,
            workshop_browser::workshop_hide,
            workshop_browser::workshop_navigate,
            workshop_browser::workshop_back,
            workshop_browser::workshop_forward,
            workshop_browser::workshop_reload,
            workshop_browser::workshop_set_queued,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
