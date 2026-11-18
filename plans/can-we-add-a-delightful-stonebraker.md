# Steam-style speed graph per download item

## Context
Each download row has a thin 1px progress bar today. You want it to look like Steam's download graph instead: every item gets a small bar graph that doubles as its progress bar, plus its speed, bytes downloaded, total size and time remaining. The row should stay compact, using units and icons instead of labels.

**Data available:** a `progress` event arrives every 500 ms per item, with `bytes` (the size of the item's SteamCMD staging folders) and `total` (`src-tauri/src/steamcmd/job.rs` `start_progress_watches`). Speed is therefore how fast the folder grows on disk. There is no separate network figure, and no Rust changes are needed.

## How the graph works (as in Steam)
- The x-axis is **progress**: the graph has N = 48 bars across the row. As the item downloads, the bars fill from left to right up to its percent done.
- Each filled bar's **height is the average speed** while the download was in that slice of the item. Heights are scaled to that item's own peak speed.
- Bars not reached yet show as a dim track. The filled bars use the primary colour.
- Items that are queued or waiting show only the empty track. Rows with no speed samples (e.g. history reloaded after a restart) fall back to the current thin bar.

## Speed tracking — new `app/composables/downloads/use-item-speed.ts`
- Module-level, session-only state keyed by `jobId:itemId`: `{ lastBytes, lastAt, speed, peak, buckets: { sum, count }[] }`.
- `record(jobId, itemId, bytes, total)` is called on each progress event.
  - `delta = bytes - lastBytes` over the time since the last event. A negative delta (folder moves between `downloads/` and `content/`) is ignored.
  - The speed shown is an exponential moving average (α ≈ 0.3) to smooth the 500 ms jitter.
  - The current speed is added to the bucket at `floor(bytes / total * N)`. Buckets that a big jump skipped get the same value, so there are no holes.
- `stats(jobId, itemId)` returns `{ speed, bars: number[] (0..1), eta (seconds) | null }`. ETA is `(total - bytes) / speed`, or null while the speed is about 0.
- `prune(keys)` drops entries for rows that no longer exist (called after Clear history).
- Hook: in `app/composables/jobs/use-job-events.ts`, the `case 'progress'` branch also calls `record(...)`. On `itemDone`, the speed goes to 0, so finished rows keep their graph but show no speed or ETA.

## Row redesign — `app/components/download/Item.vue`
Layout, everything `text-xs tabular-nums` and two lines tall like today:

```
[thumb] Title  Game                       ↓ 2.4 MB/s    [badge] [⏹][📜]
        ▂▃▅▆▇▇▆▇█▇▆▅░░░░░░░░░░░░ 42%       148.5 MB / 1.1 GB · ◷ 6:57
```
- Left: thumbnail, then the title and game on line 1, as now.
- Line 2: the new `DownloadSpeedGraph` (h-6, flex-1) with the percent right after it.
- Right stat block (fixed width, right-aligned):
  - Line 1: `i-lucide-arrow-down` + speed (`formatBytes(speed)/s`), shown only while downloading.
  - Line 2: `downloaded / total`, then `i-lucide-clock` + ETA (`formatDuration`), shown while downloading. Done rows show only the total.
- Failed and cancelled rows show the error reason in place of the graph, as today. The badge and action buttons don't change.
- New `app/components/download/SpeedGraph.vue`:
  - Props: `bars: number[]`, `percent: number`.
  - It's a flex row of N divs (`flex-1`, `gap-px`, `items-end`), each with its height as a percentage. Bars before `percent` are `bg-primary`; the rest are an `bg-accented/40` track at a small fixed height.
  - `role="progressbar"` with `aria-valuenow`.

## Small additions
- `app/utils/format.ts`: `formatDuration(seconds)` gives `6:57` or `1:02:10`, and `—` when null.
- `app/composables/downloads/use-download-rows.ts`: watch the row keys and call `prune` so cleared rows free their samples.

## Files
- **New:**
  - `app/composables/downloads/use-item-speed.ts`
  - `app/components/download/SpeedGraph.vue`
- **Changed:**
  - `app/components/download/Item.vue`
  - `app/composables/jobs/use-job-events.ts`
  - `app/composables/downloads/use-download-rows.ts`
  - `app/utils/format.ts`

## Commits
1. `feat: track per-item download speed from progress events` (`use-item-speed`, the events hook, `formatDuration`, prune)
2. `feat: show a Steam-style speed graph with speed, size and time left on download rows` (`SpeedGraph`, `Item`)

## Verification
- `bun run typecheck` and `bun run lint` are queued for you (the sandbox can't read `js-tokens`). Expect only the existing errors.
- Manual, in `bun run start`: download a large item (100 MB or more).
  - Bars fill left to right, with heights following the speed.
  - The speed and ETA update about every half second, and the percent matches.
  - When the item finishes, the graph stays and the speed and ETA disappear.
  - Queued items show the empty track. Failed items show their reason.
  - Clear history removes the rows.
  - The row height stays about the same as before.
