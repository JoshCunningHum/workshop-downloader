# Workshop Downloader

Windows desktop app (Nuxt 4 + Nuxt UI + Tauri v2) that wraps SteamCMD to download Steam Workshop
items in parallel, keeps every revision as a local snapshot, and links the active one into the
game's mod folder. macOS works as a dev stand-in. See `plans/` for the design.

## Requirements

- [bun](https://bun.sh) 1.3+
- Rust 1.90+ (`rustup`) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Development

```bash
bun install
bun tauri dev      # builds the fswatch sidecar, starts Nuxt on :3000 and opens the app
```

`bun run dev` alone serves the UI in a browser, but anything that needs Tauri (database, SteamCMD) is unavailable there.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run sidecar` | Build `crates/fswatch` and copy it to `src-tauri/binaries/fswatch-<triple>` |
| `bun run db:generate` | Write a SQL migration to `drizzle/` from `app/db/schema.ts` (applied on app start) |
| `bun run test` | Vitest |
| `bun run lint` / `bun run typecheck` | ESLint / vue-tsc |
| `bun tauri build` | Windows installer (NSIS + MSI) |

## Layout

```
app/            Nuxt srcDir (pages, components, composables, db)
drizzle/        generated SQL migrations
crates/fswatch/ filesystem watcher sidecar (NDJSON over stdio)
src-tauri/      Tauri app; Cargo workspace root (includes ../crates/fswatch)
scripts/        build-sidecar.ts
```
