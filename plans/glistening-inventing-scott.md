# Download queue, paste-anywhere, and item search

## Context

Today, pasting into the workshop input shows resolved items as per-game cards right under the
input, and you start downloads from there. The user wants:

1. A **Queue** tab on Downloads holding pending (not yet started) items. Pasting a workshop
   link/id adds it to the queue automatically (resolved via the Steam Web API). Items whose latest
   revision is already downloaded are still added, but **unticked**.
2. **Ctrl+V (⌘V on macOS) anywhere** the workshop input is shown pastes into it and queues, unless
   another input has focus — via `defineShortcuts`.
3. Queued items look like the download rows (same row layout), not the current group cards.
4. A small **"Search ..."** input on the game page's item list, next to "Update outdated", that
   filters the table.

Decisions: clipboard is read with the **Tauri clipboard plugin** (read-text only); the queue is
**in memory** (lost on restart). Starting downloads from the queue stays manual.

## Clipboard (Ctrl/⌘+V anywhere)

`defineShortcuts` calls `preventDefault()`, so the handler must read the clipboard itself.
- Add `@tauri-apps/plugin-clipboard-manager` + crate `tauri-plugin-clipboard-manager = "2"`; register
  `.plugin(tauri_plugin_clipboard_manager::init())` in `src-tauri/src/lib.rs`; capability
  `clipboard-manager:allow-read-text` (read only) in `src-tauri/capabilities/default.json`.
  Install commands are queued for the user (the sandbox blocks the registries).
- `lib/services/clipboard.ts`: `readText()` wrapper (keeps plugin imports in the service layer).
- `components/workshop-link/Input.vue`: `defineShortcuts({ meta_v: handler })` — `meta` maps to ⌘ on
  macOS and Ctrl elsewhere; without `usingInput` it doesn't fire while any input/textarea is focused.
  The handler reads the clipboard, puts the text in the input and emits `submit`. When the workshop
  input itself is focused, a native paste happens instead and an `@paste` handler emits `submit`
  after the text lands (`nextTick`). Ctrl+K stays.

## Queue

- `types/downloads.ts`: `QueueEntry { details: ItemDetails, appName: string | null, checked: boolean, downloaded: boolean, hasSnapshot: boolean }`; `DownloadTab` gains `'queue'`.
- `utils/queue.ts` (pure, unit-tested): `toQueueEntries(details, latestTimes, appNames)` — only
  `result === 1` items with an AppID; `downloaded` = newest snapshot ≥ Steam `timeUpdated`;
  `checked = !downloaded`.
- `composables/downloads/use-download-queue.ts` (module-level state, like `useJobs`), replacing
  `composables/workshop-link/use-workshop-resolve.ts`:
  - `add(text)`: `parseWorkshopIds` → `steam.resolve` (expands collections) →
    `snapshots.latestTimes` + `steam.appNames` → create apps seen for the first time (current
    `addNewApps` logic, incl. the sidebar refresh) → merge entries by item id (a re-paste refreshes the
    entry in place). Not-found/private ids → warning toast. Returns how many were added.
  - `download()`: per app, `catalog.ensureApp` + `catalog.upsertItems` for the ticked entries, skip
    items already downloading, `jobs.enqueue`; ticked entries leave the queue; toast as today.
  - `toggle`, `toggleAll`, `remove(id)`, `clear()`, counts; `tab` (shared Downloads tab state, set to
    `'queue'` when items are added).
- `constants/downloads.ts`: add the Queue tab first (`i-lucide-list-plus`; colour `info`, distinct
  from Active/Finished/Failed), with its empty state ("Paste workshop links or ids to queue them").

## UI

- `components/workshop-link/Section.vue`: input + "Add to queue" button + the two alerts (no ids
  found, no library folder). Submit/paste → `queue.add` → clear the input → toast "Added N item(s) to
  the queue"; off the Downloads page the toast gets a "View queue" action (→ Downloads, Queue tab).
  The per-game cards, "skip downloaded" switch and "Download all groups" go away;
  `components/workshop-link/ResolvedGroup.vue` is deleted.
- `components/download/QueueItem.vue`: same row as `download/Item.vue` — checkbox, hover card +
  thumbnail, title, game name, size; a badge "downloaded" / "update" / "new"; a remove (×) button.
  No progress bar (nothing is running yet).
- `components/download/QueueList.vue`: toolbar (select all checkbox, "Download N" primary button
  disabled without a library folder, "Clear queue") + the rows, `v-auto-animate` like the other tabs.
- `components/download/List.vue`: tabs become Queue | Active | Finished | Failed; the Queue tab
  renders `DownloadQueueList`; tab state comes from the queue composable so pasting switches to it.
- Game page: `game/InfoBar.vue` gets `UInput size="xs" icon="i-lucide-search" placeholder="Search ..."`
  right before "Update outdated" (`v-model:search`); `composables/games/use-game-items.ts` adds
  `search` + `visibleRows` (title or id contains the text, case-insensitive) used by the table;
  "select all" applies to visible rows. `pages/apps/[appId].vue` wires it and drops the old
  `@queued="refresh"` (downloads now start from the queue).

## Files

- New: `lib/services/clipboard.ts`, `utils/queue.ts`, `composables/downloads/use-download-queue.ts`,
  `components/download/QueueItem.vue`, `components/download/QueueList.vue`, `test/queue.test.ts`
- Changed: `components/workshop-link/{Input,Section}.vue`, `components/download/List.vue`,
  `constants/downloads.ts`, `types/downloads.ts`, `components/game/InfoBar.vue`,
  `composables/games/use-game-items.ts`, `pages/apps/[appId].vue`, `package.json`,
  `src-tauri/{Cargo.toml,src/lib.rs,capabilities/default.json}`
- Deleted: `components/workshop-link/ResolvedGroup.vue`, `composables/workshop-link/use-workshop-resolve.ts`

## Commits (tests separate)

1. ➕/chore: clipboard plugin dependency + registration + capability.
2. feat: download queue + Queue tab + queue rows (replaces the resolved cards).
3. feat: Ctrl/⌘+V anywhere the workshop input is shown.
4. feat: item search on the game page.
5. test: `toQueueEntries`.

## Verification

- `bunx vitest run` (new `test/queue.test.ts`: ticked/unticked by snapshot time, not-found and
  app-less items dropped), `bun run typecheck`, `bun run lint` — expect only the existing errors;
  `cargo test --workspace` and `cargo clippy` after adding the crate (queued for the user).
- Manual (`bun tauri dev`): on Downloads with nothing focused press Ctrl/⌘+V with a workshop URL →
  Queue tab opens with the item ticked; paste an already-downloaded item → added unticked; paste a
  collection → all its items; focus another input (e.g. Settings) and paste → normal paste only;
  paste on a game page → toast with "View queue"; Download N → items move to Active; game page
  "Search ..." filters the table.
