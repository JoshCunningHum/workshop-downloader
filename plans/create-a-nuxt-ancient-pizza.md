# Workshop Downloader — Nuxt + Tauri SteamCMD wrapper

## Context
We're building a new desktop app from scratch. `~/dev/workshop-downloader` is empty, and it sits inside the home-dir dotfiles git repo. The app wraps SteamCMD to download Steam Workshop items for many games at once, using several SteamCMD processes in parallel. Items are grouped by AppID, and the AppID is auto-detected. Every downloaded revision is kept as a local snapshot, so the user can switch versions freely; the active version is linked into the game's mod folder. Per-game adapters work out which game version an item targets, and which version of the game is installed.

The app only targets **Windows**. Development happens on macOS, and a colleague tests and develops on Windows. So all OS-specific code sits behind `cfg(windows)` / `cfg(unix)`, and the macOS build is a working dev stand-in, not just stubs.

Decisions confirmed with the user:
- **Game version detection:** per-game adapters written as declarative rules. Some ship built in, and users can write their own in the UI to say how the version is extracted.
- **Versioning:** local snapshots only. SteamCMD can only fetch the latest revision, so "changing versions" means re-pointing the link to a snapshot that was downloaded earlier.
- **Login:** anonymous by default, plus optional Steam accounts. Passwords go in the OS keyring, and Steam Guard codes are prompted for.
- **FS sidecar:** a custom Rust sidecar (`notify` + `jwalk`) that prints NDJSON and is registered as a Tauri `externalBin`.

Defaults I'm assuming (can change):
- **bun** as the package manager. pnpm isn't installed; bun 1.3 is.
- Nuxt 4, Nuxt UI v4, and Tauri v2. Exact versions get pinned to whatever is latest at scaffold time.
- A fresh `git init` inside the project folder so it doesn't land in the dotfiles repo.
- Commits only when asked.

## Architecture

```
Nuxt SPA (webview)                         Rust (Tauri core)                      Processes
─────────────────                          ─────────────────                      ─────────
pages/components (Nuxt UI)                 commands: steam_api, jobs, links,      steamcmd #0..N
composables (vueuse)          invoke ───►    library, accounts, adapters_fs  ───►  (one install dir
drizzle (sqlite-proxy) ──► tauri-plugin-sql  JobManager (tokio, Semaphore=N)        per worker slot)
adapter engine (TS)        ◄── Channel ───   SidecarHost (one long-lived) ───────► fswatch sidecar
```

- **Who owns what:** the frontend owns persistence. Drizzle talks to `tauri-plugin-sql` through the `sqlite-proxy` driver. Rust owns processes, the filesystem and network calls, and sends job events to the frontend over a Tauri `Channel`. The frontend writes the results to the database. Rust never touches the DB, which keeps us to one schema and one migrator.
- **Steam Web API calls go through Rust (`reqwest`):** `ISteamRemoteStorage/GetPublishedFileDetails` and `GetCollectionDetails` are POST calls that need no key. This avoids webview CORS. They give us `consumer_app_id` (used for AppID auto-detect), `time_updated` (the snapshot key), `file_size` (the progress target), title, tags and preview image. Pasting a collection URL expands it into its items.

## Key subsystems

### 1. SteamCMD management (`src-tauri/src/steamcmd/`)
- `install.rs`: on first run, downloads the official SteamCMD archive into `%APPDATA%/<app>/steamcmd/base`. That's `steamcmd.zip` on Windows; in dev on macOS it's `steamcmd_osx.tar.gz`. Then it runs it once with `+quit` so it self-updates. SteamCMD is **not** bundled: it updates itself and needs a writable folder.
- `pool.rs`: *assumption to verify on Windows:* two SteamCMD instances can't safely share one install folder. So each of the N worker slots gets its own copy (`steamcmd/worker-{i}`), cloned from `base`. N is configurable (default 3). A `tokio::Semaphore` hands out slots.
- `job.rs`: a job is `{jobId, appId, itemIds[], accountId?}`. It runs `steamcmd +force_install_dir <staging> +login <anonymous|user> +workshop_download_item <app> <item> validate … +quit`. Batching several items into one process cuts down on logins. stdout/stderr are piped, every line becomes a `log` event, and the process can be cancelled (kill the child).
- `parse.rs`: pattern-matches the output (`Success. Downloaded item …`, `ERROR! Download item … failed (…)`, the login and Steam Guard prompts, rate-limit and timeout errors). Covered by Rust unit tests built from captured log fixtures.
- **Progress doesn't depend on stdout.** SteamCMD on Windows is known to buffer or skip progress output when piped (to verify). Instead, the fswatch sidecar measures the `steamapps/workshop/downloads/<app>/<item>` and `content/<app>/<item>` folders and divides by `file_size` from the Web API.
- **Accounts** (`accounts.rs`): the `keyring` crate stores passwords (Windows Credential Manager in production, macOS Keychain in dev). First login: when SteamCMD exits on a Steam Guard error, the UI asks for the code, and the job retries with `+set_steam_guard_code <code>`. SteamCMD's cached login (`config/config.vdf`) is then copied into each worker folder so later runs only need `+login <user>`. *Verify on Windows.*

### 2. Library and snapshots (`library.rs`)
- After a job succeeds, the content moves from staging to `<library>/<appId>/<itemId>/<time_updated>/`. Staging lives on the same volume as the library, so it's a rename, not a copy. A `snapshots` row is then written.
- Updating an item downloads a new snapshot without deleting the old ones. A retention setting (keep last K, plus pinned) handles cleanup.
- An update check runs the batch `GetPublishedFileDetails` on all items in an app and flags items where `time_updated` is newer than the latest snapshot. It runs on demand, and on a timer if the user turns that on.

### 3. Links (`links.rs`)
- Windows: **directory junctions** by default, via the `junction` crate. They need no admin rights or Developer Mode. True symlinks (`std::os::windows::fs::symlink_dir`) are an option per app, and they need Developer Mode or admin. macOS dev: `std::os::unix::fs::symlink`.
- The link path is `{modsPath}/{linkName}`, built from the app's settings or adapter template. Switching versions means removing the link and re-creating it to point at another snapshot. Before replacing anything, it checks the target really is a link that we created, and never deletes a real folder.
- A "verify links" action finds links that are broken or have drifted.

### 4. FS sidecar (`crates/fswatch/`)
- A standalone Rust binary. It reads JSON commands on stdin and writes NDJSON events on stdout:
  - in: `{"op":"watch","id":"job-12","paths":[...],"intervalMs":500}`, `{"op":"unwatch","id":...}`, `{"op":"size","id":...,"path":...}`
  - out: `{"id":"job-12","event":"size","bytes":123,"files":45}`, `{"event":"error",...}`
- Uses `notify` events, debounced, to trigger `jwalk` rescans, with a polling fallback. It also handles one-off size requests for library and snapshot sizes in the UI.
- `SidecarHost` in Tauri spawns it once via `tauri-plugin-shell` (`app.shell().sidecar("fswatch")`), sends each line on to the right job's Channel, and restarts it if it crashes.
- `scripts/build-sidecar.ts` runs `cargo build -p fswatch --release [--target <triple>]` and copies the result to `src-tauri/binaries/fswatch-<triple>[.exe]`. It runs automatically from `beforeDevCommand` and `beforeBuildCommand`.

### 5. Adapter engine (`app/adapters/`)
- An adapter is JSON, stored in the `adapters` table. Built-in ones are seeded from `app/adapters/builtin/*.json`, starting with a generic tags-only adapter plus one or two real examples. Users can create or edit adapters in a UI form.
  ```json
  {
    "id": "rimworld", "appId": 294100,
    "modsPath": "{install}/Mods", "linkName": "{itemId}",
    "gameVersion": [{ "source": "file", "path": "{install}/Version.txt", "regex": "^(\\d+\\.\\d+)" }],
    "itemVersions": [
      { "source": "tags", "regex": "^(\\d+\\.\\d+)$" },
      { "source": "file", "glob": "About/About.xml", "xpath": "//supportedVersions/li" }
    ]
  }
  ```
- Extractor sources: `tags` (regex), `file` with one of `regex`, `jsonPath` or `xpath`, and `buildid` (the installed game's buildid from its `appmanifest_<appid>.acf`).
- Rust command `read_files(root, globs, maxBytes)` reads the files. The TS engine applies the rules: `DOMParser` for xpath, and a small JSON-path helper. Rules are tried in order, and the first one that returns a value wins.
- Unit tests (vitest) cover each extractor type.

### 6. Game discovery (`steam_local.rs`)
- Finds the Steam install path. On Windows that's the registry key `HKCU\Software\Valve\Steam\SteamPath` via the `winreg` crate; on macOS dev it's `~/Library/Application Support/Steam`. Then it parses `steamapps/libraryfolders.vdf` and `appmanifest_*.acf` (with the `keyvalues-parser` crate) to find each game's install folder and buildid.
- This pre-fills the app's `installPath`. The user can always override it.

## Data model (`app/db/schema.ts`, drizzle sqlite)
- `apps`: appId (PK), name, installPath, modsPath, linkMode (`junction|symlink`), adapterId, detectedGameVersion, manualGameVersion, accountId, autoUpdate, retention
- `adapters`: id, name, appId nullable, builtin, definition (JSON)
- `workshop_items`: id (publishedfileid, PK), appId, title, author, previewUrl, tags (JSON), remoteTimeUpdated, fileSize, activeSnapshotId, pinned, autoUpdate
- `snapshots`: id, itemId, timeUpdated, path, sizeBytes, downloadedAt, itemVersions (JSON), pinned
- `links`: id, itemId, appId, linkPath, snapshotId, type, createdAt, status
- `jobs`: id, appId, itemIds (JSON), status, workerSlot, bytesDone, bytesTotal, error, log tail, timestamps
- `steam_accounts`: id, username, lastLoginOk (no secrets in the DB)
- `settings`: key/value (library path, concurrency, poll interval)

Migrations: `drizzle-kit generate` writes SQL into `drizzle/`. These are bundled with `import.meta.glob('~/../drizzle/*.sql', { as: 'raw' })`, and a small custom migrator (`app/db/migrate.ts`) records applied ones in `__drizzle_migrations` and runs on app start.

## UI (Nuxt UI + vueuse)
- `pages/index.vue`: dashboard showing the active and queued jobs, with per-job progress bars (bytes from the sidecar), per-worker status, and collapsible logs.
- `pages/apps/index.vue` and `pages/apps/[appId].vue`: one page per game. It shows installed version vs. item versions, the item table (update available, active snapshot, link status), bulk update/link/unlink, and app settings with the adapter picker.
- `pages/items/[id].vue`: snapshot list with sizes and detected versions, a "make active" action (version switch), pin, and delete.
- `pages/add.vue`: paste IDs, URLs or a collection URL. It resolves via the Web API, groups items by detected AppID, and queues the download.
- `pages/adapters/*`: list and editor for adapters, with a "test against item" preview.
- `pages/settings.vue`: library path, concurrency, accounts (add, login with Steam Guard), SteamCMD reinstall.
- Composables: `useJobs` (Channel to reactive store), `useDb`, `useSteamApi`, `useAdapters`. vueuse handles `useIntervalFn` (update polling), `useStorage` (UI prefs) and `useDebounceFn`.

## Project layout
```
app/            nuxt srcDir (pages, components, composables, db, adapters)
drizzle/        generated SQL migrations
crates/fswatch/ sidecar crate
src-tauri/      tauri app (Cargo workspace root includes ../crates/fswatch)
scripts/        build-sidecar.ts
.github/workflows/windows.yml   windows-latest build + cargo test (gives us a Windows check from the Mac)
```
Tauri config: `frontendDist: ../.output/public`, `devUrl: http://localhost:3000`, `beforeDevCommand: bun run sidecar && bun run dev`, `beforeBuildCommand: bun run sidecar && bun run generate`, `externalBin: ["binaries/fswatch"]`, bundle target NSIS/MSI.
Nuxt config: `ssr: false`, `devServer.host: TAURI_DEV_HOST`, `vite.clearScreen: false`, `envPrefix: ['VITE_','TAURI_']`, `strictPort: true`.
Plugins: `sql` (sqlite), `shell` (sidecar only), `dialog` (folder pickers), `fs` (scoped), `opener`, `log`, `single-instance`. Capabilities in `src-tauri/capabilities/default.json` are kept to the minimum: shell may only spawn the `fswatch` sidecar; SteamCMD is spawned from Rust, not exposed to JS.

## Build order (milestones)
1. Scaffold: `git init`, Nuxt 4 + Nuxt UI + vueuse, `tauri init`, Cargo workspace with the fswatch crate, build-sidecar script, drizzle + plugin-sql + migrator. Then `bun tauri dev` opens an empty shell on macOS.
2. fswatch sidecar and SidecarHost (size and watch events wired to a test page).
3. SteamCMD install, worker pool, jobs, anonymous downloads, progress, library snapshots.
4. Web API resolve, AppID auto-detect, add-items page, apps and items pages.
5. Links (junction/symlink) and the version switching UI.
6. Adapter engine with built-ins, the editor, and game discovery.
7. Accounts (keyring, Steam Guard flow), update checks and retention.
8. Windows CI workflow, and a handoff checklist for the colleague.

## Risks to verify on Windows (handoff checklist)
- Whether several SteamCMD instances can share one install folder (this decides per-worker copies).
- Whether SteamCMD stdout is buffered when piped (progress comes from the sidecar either way).
- Whether the Steam Guard retry via `+set_steam_guard_code` works, and whether copying login caches between worker folders works.
- Junction creation across drives: junctions need local NTFS volumes. Symlink mode needs Developer Mode.
- Long paths (>260 chars) inside mods: enable the `\\?\` prefix and long-path awareness in the manifest.
- Windows Defender slowing SteamCMD or rename operations; antivirus locking staging folders.

## Verification
- macOS: `bun tauri dev`. Add a known anonymous-downloadable item (a free game's workshop item). Check that the AppID is auto-detected, the progress bar moves, a snapshot folder appears, the symlink is created in a test mods folder, and switching snapshots re-points the link.
- Run three or more downloads at once, and check that separate workers and progress bars show and none of them clash.
- `cargo test --workspace` (SteamCMD parser fixtures, link safety, sidecar protocol) and `bunx vitest` (adapter extractors, migrator).
- The Windows colleague runs `bun tauri dev` and `bun tauri build` (NSIS) and goes through the risk checklist above. The `windows.yml` CI build has to pass.
