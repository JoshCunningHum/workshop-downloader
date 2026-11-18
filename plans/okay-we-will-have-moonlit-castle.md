# Restore a game's mods to a point in time

## Context

"Check updates" followed by "Update outdated" (or any single update) sometimes breaks a game. Every
download becomes the active snapshot right away, and the only way back is to open each item and
click "Make active". This feature lets you pick a moment from the game's history and put every
item's link back to how it was then.

Today the app keeps no record of when snapshots were switched. It only has `snapshots.downloaded_at`,
and the links table holds just the current link. So this plan adds a change log first.

Decisions made with the user:
- **History source:** a new change-log table, backfilled from past download times.
- **Items that didn't exist at the chosen time:** unlinked. Their files stay in the library.
- **Hold:** the confirm modal has a checkbox, "Hold changed items at this version". A held item is
  skipped by auto-update, and a manual download saves the snapshot without making it active.

Assumption: this works per game. The History button sits on the game page, next to the other
game actions.

## 1. Change log (data)

New table `snapshot_events` in `app/lib/db/schema.ts`:

| column | notes |
|---|---|
| `id` | autoincrement |
| `app_id`, `item_id` | indexed on `(app_id, at)` |
| `kind` | `'download' \| 'activate' \| 'unlink' \| 'restore' \| 'baseline'` |
| `from_snapshot_id` | linked snapshot before the change, or null |
| `to_snapshot_id` | linked snapshot after the change; null means unlinked |
| `at` | ms epoch |

Also add `held` (boolean, default false) to `workshop_items`.

Migration `drizzle/0004_*.sql`, generated with `drizzle-kit generate` and then extended by hand
with the backfill:
1. One `download` event per existing snapshot, at `downloaded_at`, with `to` = that snapshot and
   `from` = the same item's previous snapshot by `downloaded_at` (correlated subquery).
   `app_id` comes from a join on `workshop_items`.
2. A `baseline` event, timed at the migration, for each item whose current link
   (`links.snapshot_id`, or null when there is no link) differs from what step 1 ends with. This
   keeps the log in line with manual switches and unlinks made before the log existed.

New service `app/lib/services/snapshot-events.ts`, following the style of `snapshots.ts`:
`record(event)`, `forApp(appId)`, `forAppBetween(appId, from, to)`.

## 2. Recording changes

In `app/composables/library/use-library.ts`:
- `activate(snapshotId, { reason = 'activate' })`: read the existing link's `snapshotId` as
  `from`, and after linking, record an event of kind `reason`. Only record it when `from !== to`,
  or when it's a download (re-downloading the same revision still shows up on the calendar).
- `unlink(itemId, { reason = 'unlink' })`: record `from` = old link snapshot, `to` = null, when a
  link existed.
- Callers that pass a reason: `use-job-events.ts` `onItemDone` passes `'download'`, restore passes
  `'restore'`. Everything else (item page "Make active", table Link/Unlink, mods import, removeItem)
  keeps the defaults.

## 3. Pure logic (testable): `app/utils/restore-point.ts`

- `stateAt(events, t) → Map<itemId, snapshotId | null>`: for each item, the `to` of its last event
  with `at <= t`. Items with no event by `t` are left out, which means they didn't exist yet.
- `planRestore({ events, t, current: Map<itemId, snapshotId|null>, snapshots: Map<id, SnapshotRow> })`
  returns a list of `{ itemId, from, to, action: 'switch' | 'unlink' | 'link' | 'missing' }`:
  - Items in `current` but not in `stateAt` → `unlink`.
  - Target differs from current → `switch`, `link` or `unlink`.
  - Target snapshot no longer exists (deleted by retention) → `missing`. This is shown in the
    modal and skipped.
- `eventsByDay(events) → Map<'YYYY-MM-DD' (local), Event[]>` for the calendar bars.
- `timelineRange(dayEvents) → { start, end }`: first event − 1 h to last event + 1 h.

Tests go in `test/restore-point.test.ts` and get their own commit.

## 4. UI

Game page (`app/pages/apps/[appId].vue`): `view` gains `'history'`. `GameInfoBar` gets a
"History" button (`i-lucide-history`) that emits `open-history`, in the same toggle style as the
settings gear.

New components in `app/components/history/`:
- **`Panel.vue`** (the view, with a back button like `SettingsForm`): the calendar on top, the
  timeline below. The timeline area is an empty placeholder ("Pick a day") until a day is picked.
- **`Calendar.vue`**: `UCalendar` (Nuxt UI 4.12 has a `#day` slot) where each day cell shows up to
  ~6 thin bars, one per event, coloured by kind (download = primary, activate = info,
  unlink = neutral, restore = warning, baseline = dimmed), plus "+n" when there are more. Days
  without events are dimmed. Date keys come from `day.year/month/day`, so there's no new
  dependency.
- **`Timeline.vue`**: a horizontal track from `timelineRange`, with one tick per event (tooltip:
  item title, kind, revision before → after) and a `USlider` (step 1 min) for the point. Shows the
  chosen time, plus a "Restore to this point" button.
- **`RestoreModal.vue`** (`UModal`, following `mods-import/Dialog.vue`): the planned changes
  grouped as Switch / Unlink / Link / Can't restore (snapshot deleted), each row showing the item
  title and revision dates `formatTime(from) → formatTime(to)`. It has the "Hold changed items at
  this version" checkbox and Cancel / Restore buttons. Restore is disabled when nothing would change.

Composable `app/composables/history/use-restore-point.ts`: loads the events and the game's
snapshots, picks the day and point, builds the plan (current state = `data.links`), and applies it
through `page.run('Restore', …)`. Applying calls `library.activate(to, { reason: 'restore' })` or
`library.unlink(id, { reason: 'restore' })` one item at a time, collects failures into a toast, and
when hold is ticked sets `items.update(id, { held: true })` on the changed items.

## 5. Hold

- `use-update-checker.ts` auto-queue: skip `i.held`.
- `use-job-events.ts` `onItemDone`: if the item is held, keep the snapshot and run pruning, but skip
  `activate`, and log `[app] <id> is held; new revision kept but not activated`.
- `ItemsTable.vue` title cell: a "held" badge. The row actions get a "Release hold" button when
  held. The item page gets the same release button next to the snapshot list.
- Pruning is unchanged. Restore points whose snapshots retention has already deleted show up as
  "Can't restore".

## Known limits (to tell the user)

- History before this ships is rebuilt from download times only. Older manual switches are lost,
  except the one-off `baseline` that matches today's state.
- A game with no mods folder has no links, so restoring there only changes the "active" marker.

## Commits (gitmoji, single-line)

1. `:sparkles:` log snapshot changes per game (schema, migration + backfill, service, recording in
   use-library and job events)
2. `:sparkles:` hold items at their version (column use, update checker, onItemDone, badges and release)
3. `:sparkles:` restore a game's mods to a point in time (utils, composable, calendar, timeline,
   modal, InfoBar button)
4. `:white_check_mark:` cover restore point planning (`test/restore-point.test.ts`)

## Verification

- `bunx vitest run` (the new tests plus `migrate.test.ts`), and `bunx vue-tsc --noEmit`.
- Check the migration on a copy of the dev DB: event counts equal the snapshot counts, and baseline
  rows appear only where the links differ.
- The user tests the app by hand (`bun tauri dev`): update an item, open History, pick today, drag to
  before the update, confirm. The modal lists the switch, the link re-points (Verify links shows
  ok), and a new `restore` bar appears. Then with Hold ticked: Check updates and auto-update
  skip the item, and the table shows "held".
