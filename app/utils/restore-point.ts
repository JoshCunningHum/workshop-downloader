// Restoring a game's mods to a point in time, from its log of linked-snapshot changes.

const HOUR_MS = 3_600_000

export interface HistoryEvent {
  id: number
  itemId: string
  fromSnapshotId: number | null
  toSnapshotId: number | null
  at: number
}

export type RestoreAction = 'switch' | 'link' | 'unlink' | 'missing'

export interface RestoreChange {
  itemId: string
  from: number | null
  to: number | null
  action: RestoreAction
}

const byTime = (a: HistoryEvent, b: HistoryEvent) => a.at - b.at || a.id - b.id

/**
 * Linked snapshot per item at time `t` (events at `t` count): the target of its last change.
 * null means unlinked; items with no change by then are left out (they weren't there yet).
 */
export function stateAt(events: HistoryEvent[], t: number): Map<string, number | null> {
  const state = new Map<string, number | null>()
  for (const e of [...events].sort(byTime)) {
    if (e.at > t) break
    state.set(e.itemId, e.toSnapshotId)
  }
  return state
}

/**
 * What it takes to go from the `current` links (item -> linked snapshot) back to time `t`.
 * Items not there yet at `t` get unlinked; targets no longer on disk are `missing` (skipped).
 */
export function planRestore(input: { events: HistoryEvent[], t: number, current: Map<string, number | null>, existing: Set<number> }): RestoreChange[] {
  const target = stateAt(input.events, input.t)
  const changes: RestoreChange[] = []
  for (const itemId of new Set([...input.current.keys(), ...target.keys()])) {
    const from = input.current.get(itemId) ?? null
    const to = target.get(itemId) ?? null
    if (from === to) continue
    const action: RestoreAction = to !== null && !input.existing.has(to)
      ? 'missing'
      : to === null ? 'unlink' : from === null ? 'link' : 'switch'
    changes.push({ itemId, from, to, action })
  }
  return changes
}

/** Local calendar day of a time, as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Events grouped by local day, each day oldest first. */
export function eventsByDay<T extends HistoryEvent>(events: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>()
  for (const e of [...events].sort(byTime)) {
    const key = dayKey(e.at)
    if (!days.has(key)) days.set(key, [])
    days.get(key)!.push(e)
  }
  return days
}

/** Span of a day's timeline: its first change minus an hour to its last change plus an hour. */
export function timelineRange(dayEvents: HistoryEvent[]): { start: number, end: number } | null {
  if (!dayEvents.length) return null
  const times = dayEvents.map(e => e.at)
  return { start: Math.min(...times) - HOUR_MS, end: Math.max(...times) + HOUR_MS }
}
