# Tidy the frontend into an Atlas-style structure

## Context

The frontend grew feature by feature and is now uneven: `pages/apps/[appId].vue` is 689 lines
(store header, info bar, item table with selection, settings form), `useJobs.ts` is 303, and
several components/pages sit at 200–280. Composables mix three concerns — drizzle queries, Tauri
`invoke` calls and the business logic combining them — and 5 components plus 2 pages call
`invoke`/the DB directly. Types live inside composables; there is no constants or routes module.

Goal: mirror `../Atlas/frontend` — thin pages composing feature components; feature-grouped
hooks; a service layer over a low-level client; shared `types/` and `constants/` — so no route,
component or composable carries too much. **Pure restructuring: no behaviour or UI change.**

Decisions (from the user): services cover **DB queries and Tauri calls**; composable files use
Atlas **kebab-case** (`use-jobs.ts`); **frontend only** (src-tauri untouched).

## Target layout (`app/`)

```
pages/                 thin route files: load via a page composable, render feature components
layouts/ middleware/ plugins/      unchanged (import paths only)
components/
  OpenFolderButton.vue           shared components stay at the root (Atlas: components/*.tsx)
  download/  game/  workshop-item/  workshop-link/  adapter/  mods-import/
  settings/  setup/  sidebar/   (existing, folders renamed to lowercase)
composables/           Atlas hooks/: one folder per feature, kebab-case files
  use-attempt.ts  use-db.ts      generic hooks at the root
  downloads/ games/ items/ adapters/ jobs/ library/ settings/ setup/ steam/ mods-import/ workshop-link/
lib/
  api/tauri.ts                   the client: command<T>(name, args) + stream<E>(name, args, onEvent)
  db/                            moved from app/db (client, migrate, schema) + instance.ts (setDb/db)
  adapters/                      moved from app/adapters (engine, envExt, jsonPath, builtin/)
  services/<domain>.ts           all data access: drizzle queries + Tauri commands, plain functions
types/<domain>.ts      shared types (moved out of composables and adapters/types.ts)
constants/<feature>.ts constants + routes.ts (route builders)
utils/                 pure helpers (auto-imported), kebab-case file names
```

Nuxt wiring: `nuxt.config.ts` → `imports: { dirs: ['composables/**'] }` so nested kebab-case
composables auto-import (export names stay `useJobs` etc.). Components keep their current tag names
via folder prefixes (`components/download/Item.vue` → `DownloadItem`, `workshop-item/Tooltip.vue` →
`WorkshopItemTooltip`, `mods-import/Dialog.vue` → `ModsImportDialog`), so templates barely change.
`lib/`, `services/`, `types/`, `constants/` are imported explicitly (`~/lib/services/catalog`), as Atlas does.

## Layers

**`lib/api/tauri.ts`** — `command<T>(name, args)` wraps `invoke` and turns the Rust error string
into an `Error`; `stream<E>(name, args, onEvent)` creates the `Channel`. Only services import it.

**`lib/services/`** — stateless functions, one file per domain, owning every query/command:
`settings` (rows + `jobs_set_concurrency`), `apps` (apps table, item counts), `items` (workshop_items,
latest snapshot times), `snapshots` (rows + `snapshot_delete`/`snapshot_size`), `links` (rows +
`link_create`/`link_remove`/`links_verify`), `jobs` (job rows + `job_start`/`job_cancel`),
`accounts` (rows + keyring commands), `adapters` (rows + `read_files`), `steam` (web API + local
install commands), `steamcmd` (`steamcmd_status`/`steamcmd_install`/`steam_app_index`), `app-index`
(steam_apps table), `mods` (`mods_scan`/`mods_adopt`), `files` (`open_in_file_manager`), `fswatch`
(dev page). Bodies are moved verbatim from today's composables.

**Composables** keep reactive state and logic that combines services (e.g. `ensureApp`,
`checkUpdates`, `activate`/`prune`/`removeItem`, the job lifecycle, mods import, setup steps).
Pass-through composables disappear: `useSteamApi`, `useAccounts`, `useSteamAppIndex` → callers
import the service. `useDb` keeps only the `ready`/`error` state; `db()` moves to `lib/db/instance.ts`.

**`types/`** — `steam.ts` (ItemDetails, Resolved, InstalledGame, AppDetails), `jobs.ts` (JobEvent,
LiveJob, ItemState, GuardKind), `steamcmd.ts` (SteamCmdStatus, AppEntry, AppIndexEvent), `mods.ts`
(FoundFolder, ImportCandidate, ImportStatus), `settings.ts` (AppSettings), `adapters.ts` (was
`adapters/types.ts`). DB row types stay in `lib/db/schema.ts`.

**`constants/`** — `settings.ts` (defaultSettings), `setup.ts` (SetupStatus, SETUP_STEPS),
`downloads.ts` (tab colours, empty states, item-state badge colours), `mods-import.ts` (skip
reasons), `settings-categories.ts`, `routes.ts` (`ROUTES.app(id)`, `ROUTES.item(id)`,
`ROUTES.settings(category)`, …) replacing hard-coded `/apps/${id}`-style strings.

## Splits (largest first)

| Today | Becomes |
|---|---|
| `pages/apps/[appId].vue` (689) | page + `games/use-game-page.ts` (load/refresh, store fetch) + `games/use-game-items.ts` (rows, selection, download/link/unlink/remove) + `games/use-game-settings.ts` (form, save, browse, detect, mods folder path); components `game/StoreHeader`, `game/InfoBar`, `game/ItemsTable`, `game/SelectionBar`, `game/SettingsForm` |
| `composables/useJobs.ts` (303) | `jobs/use-jobs.ts` (state + enqueue/cancel/retry/clear) + `jobs/use-job-events.ts` (event handling, item done, finished) + `utils/job-state.ts` (itemState, historyItems, jobProgress) |
| `pages/adapters/[id].vue` (277) | page + `adapters/use-adapter-editor.ts`; `adapter/Form`, `adapter/TestCard`, `adapter/RuleList` (was RuleListEditor) |
| `WorkshopItemTooltip.vue` (267) | `workshop-item/Tooltip` (positioning only) + `workshop-item/DetailsCard` (content) + `items/use-item-details.ts` (cached Steam fetch + library data) |
| `WorkshopLink/Section.vue` (266) | `workshop-link/Section` + `workshop-link/ResolvedGroup` + `workshop-link/use-workshop-resolve.ts` |
| `ModsImportDialog.vue` (236) | `mods-import/Dialog` + `mods-import/CandidateRow`; logic stays in `mods-import/use-mods-import.ts` |
| `pages/items/[id].vue` (229) | page + `items/use-item-page.ts`; `workshop-item/Summary`, `workshop-item/SnapshotList` |
| `pages/index.vue` (208) | page + `downloads/use-download-rows.ts` (rows, ratio sort, tabs); `download/List`, `download/GuardPrompt`, `download/WorkerBadges`, `download/LogModal` |
| thumbnail + placeholder markup repeated in 4 places | `workshop-item/Thumbnail` |
| game card markup in `pages/apps/index.vue` | `game/Card` |

Size targets after the refactor: pages ≤ ~120 lines, components ≤ ~200, composables ≤ ~150.

## Order of work (each step leaves the app building; one refactor commit per step)

1. Move `app/db` → `lib/db` and `app/adapters` → `lib/adapters`, `adapters/types.ts` → `types/adapters.ts`;
   update `drizzle.config.ts` schema path and the migrations glob in `migrate.ts`. Test import-path
   updates go in their own commit right after (repo rule: tests separate).
2. Add `types/` and `constants/` (move definitions out of composables; no logic change).
3. Add `lib/api/tauri.ts` and `lib/services/*`; rewire composables, components and pages to them; drop
   the pass-through composables. No `invoke`/`db()` left outside `lib/`.
4. Move composables into feature folders with kebab-case names; add `imports.dirs`.
5. Rename component folders to lowercase feature folders; extract `WorkshopItemThumbnail` and `GameCard`.
6. Split the large pages/components/composables per the table; use `ROUTES` for links/navigation.
7. Rename `utils` files to kebab-case (`workshop-input.ts`, `job-state.ts`); test imports in their own commit.

## Verification

- After every step: `bun run typecheck`, `bun run lint`, `bunx vitest run` (queued for the user — the
  sandbox can't read `node_modules/js-tokens`); expect only today's existing errors (nuxt.config
  `process`, the 4 lint errors) and 37/37 tests. `cargo test` is unaffected.
- Structural checks: `grep -rn "invoke(\|invoke<\|db()" app --exclude-dir=lib` returns nothing; no file
  over the size targets (`wc -l`).
- Manual smoke in `bun tauri dev` (behaviour must be identical): setup flow on a fresh DB; sidebar
  games + counts; paste a workshop link → resolve → queue; Downloads tabs, progress, log, retry;
  game page items table, settings form, import existing; item page snapshots; adapter editor test
  card; Settings categories incl. Update app list; folder buttons; hover card.
