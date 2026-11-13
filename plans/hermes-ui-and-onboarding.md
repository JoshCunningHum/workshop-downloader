# Hermes-style UI and onboarding for Workshop Downloader

## Goal

Adopt the Hermes app shell and first-run flow in `workshop-downloader`:
- First-run onboarding that blocks the app until required files/data exist.
- Sidebar with an app (game) selector instead of a flat nav menu.
- A main input above the content for pasting workshop items, which auto-creates apps when a new AppID is seen.

No backend/Rust changes are required beyond reusing existing commands (`steam_root_path`, `steam_installed_games`, `steamcmd_status`).

## Current UI (workshop-downloader)

- `app/app.vue`: `UDashboardGroup` + `UDashboardSidebar` with a `UNavigationMenu` (Downloads, Add items, Games, Adapters, Settings) and `NuxtPage`.
- Adding items lives on a separate `/add` page (`app/pages/add.vue`): paste ids/URLs, resolve, group by AppID, queue.
- Games appear only after items are added (`/apps`).
- Settings page holds library path, SteamCMD install, accounts.
- No setup/onboarding gate; missing library path is a warning alert.

## Target UI (Hermes patterns)

- `app/app.vue`: `UApp` + `NuxtLayout` + `NuxtPage` + loading indicator.
- `layouts/default.vue`: `UMain` > `UDashboardGroup` > `Sidebar` + `UDashboardPanel` (slot) + modals.
- `layouts/blank.vue`: bare `UMain` for setup.
- `Sidebar/index.vue`: `UDashboardSidebar` collapsible/resizable; header holds `SidebarAppSelect`.
- `Sidebar/AppSelect.vue`: `USelectMenu` over apps from `useCatalog().listApps()`, with `create-item` search that searches Steam by name and calls `catalog.ensureApp(appId, name)` (auto-add), then selects it.
- Main input: `WorkshopLink/Section.vue` + `Input.vue` (hermes style) placed above page content on the downloads/index page, plus validation alerts.
- Route middleware `ensure-setup` redirects to `/setup` until initialized, and `/setup` back to `/` once done.

## Onboarding design

New `pages/setup.vue` (blank layout) with `SetupStepper` and step components. Steps:

1. **Steam install** (`SetupSteamStep`)
   - Call `steam_root_path()`. If found, show path; else let user pick the Steam folder and persist as new setting `steamPath`.
   - Scan `steam_installed_games()` and pre-create app rows via `catalog.ensureApp` (name + installPath) so the sidebar is populated. Mark complete when a root exists.
2. **Library folder** (`SetupLibraryStep`)
   - Reuse `pickLibrary` logic from settings. Persist `libraryPath`. Required.
3. **SteamCMD** (`SetupSteamCmdStep`)
   - Reuse install flow from settings (`steamcmd_status`, `steamcmd_install`). Required: installed.
4. Optional: accounts can stay in Settings; not part of required onboarding.

`stores/setup.ts`:
- `SetupStatus` enum: `Idle, Steam, Library, SteamCMD, Finished`.
- `setupNeeded` computed: `!!steamPath && !!libraryPath && steamcmdInstalled`.
- `next()` advances steps and calls each hook's `start()`; on last, `navigateTo('/')`.

Middleware `ensure-setup.ts` checks `steamPath`, `libraryPath`, `steamcmd installed`; redirects accordingly. Add `steamPath` to `AppSettings`/settings table (new migration).

## Sidebar app selector design

- Data source: `catalog.listApps()` (already in DB) instead of hermes' appids file.
- State: `useState<AppRow | null>('currentApp')` plus `useCatalog`.
- `AppSelect.vue`:
  - items from `listApps()` mapped `{ label: name ?? App ${appId}, value: appId }`.
  - `v-model="current"`; on change, navigate to `/apps/{appId}` (or set context only).
  - search input; `@create="onSearch"` calls `useSteamApi().appNames`/search to find an app by name/id, then `catalog.ensureApp`, refresh list, set current. This is the "auto adds new apps if the app is new" behavior at the selector level.
- Collapse support via `collapsed` prop from sidebar.

## Main input design

Move the `/add` flow's input to the top of the downloads page (and optionally keep `/add` redirecting to `/`):
- `components/WorkshopLink/Input.vue`: `UInput` with Ctrl+K shortcut, clear button (hermes).
- `components/WorkshopLink/Section.vue`: input + validation alerts + resolve/queue UI extracted from `add.vue`.
- Reuse existing logic: `parseWorkshopIds`, `steam.resolve`, `catalog.ensureApp`, `catalog.upsertItems`, `jobsStore.enqueue`.
- Auto-add apps: `ensureApp` already inserts new app rows; after resolve, refresh sidebar list (re-run `listApps`/async data) so new games appear in selector. If only one new app, set it as `current`.
- Keep grouping by detected AppID and per-group download buttons.

## Routing/layout changes

- Add `layouts/default.vue` and `layouts/blank.vue`.
- Move sidebar/nav out of `app.vue` into default layout.
- Add `pages/setup.vue`.
- Add `middleware/ensure-setup.ts` and apply via `definePageMeta` to `/` and other pages (or globally in nuxt.config routeRules).
- Keep `/add` as redirect to `/` or keep page but reuse Section.
- `/apps`, `/apps/[appId]`, `/settings`, etc. remain.

## State and composables

- Add `steamPath` to `AppSettings` + migration.
- Add `useSetupStore` (pinia) mirroring hermes, with hooks:
  - `useSteamPathStep` (detect/pick Steam root, scan games)
  - `useLibraryStep` (pick library)
  - `useSteamCmdStep` (install/check)
- Reuse `useCatalog`, `useSettings`, `useSteamApi`, `useJobs`.
- `currentApp` state for sidebar selection.

## Files to touch (new/changed)

New:
- `app/layouts/default.vue`, `app/layouts/blank.vue`
- `app/middleware/ensure-setup.ts`
- `app/pages/setup.vue`
- `app/stores/setup.ts`
- `app/components/Sidebar/index.vue`, `app/components/Sidebar/AppSelect.vue`
- `app/components/Setup/Stepper.vue`, `SetupSteamStep.vue`, `SetupLibraryStep.vue`, `SetupSteamCmdStep.vue`
- `app/components/WorkshopLink/Input.vue`, `WorkshopLink/Section.vue`

Changed:
- `app/app.vue` (layout wrapper)
- `app/pages/index.vue` (add WorkshopLink Section above dashboard)
- `app/pages/add.vue` (redirect or thin wrapper)
- `app/composables/useSettings.ts` (add `steamPath`)
- `app/db/schema.ts` + drizzle migration (settings is key/value, so no schema change needed; just use key)
- `app/pages/settings.vue` (show steamPath override, keep existing sections)

## Risks

- Setup middleware must not block `/setup` itself or assets; follow hermes guard exactly.
- Steam root auto-detection may fail on non-standard installs; provide manual picker.
- Scanning installed games could be slow; run in setup step with progress, skip if already present.
- Sidebar app list must refresh after `ensureApp`; use `refresh`/async data or computed from a reactive store.
- Keep existing tests (engine, workshopInput, retention, migrate, jsonPath) passing; no changes to those modules.

## Verification

- Fresh DB/state: app opens `/setup`; completing steps lands on `/`.
- Sidebar lists scanned games; selecting navigates to app page.
- Paste a workshop URL/id in main input; new game auto-created and appears in sidebar; queue works.
- Existing pages and settings still function.
- `bunx vitest` and `cargo test --workspace` pass.