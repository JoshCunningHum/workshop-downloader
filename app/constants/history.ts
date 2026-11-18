import type { SnapshotEventKind } from '~/lib/db/schema'
import type { RestoreAction } from '~/utils/restore-point'

/** Label and bar colour of each kind of change in a game's history. */
export const EVENT_KINDS: Record<SnapshotEventKind, { label: string, bar: string }> = {
  download: { label: 'Downloaded', bar: 'bg-primary' },
  activate: { label: 'Switched', bar: 'bg-info' },
  unlink: { label: 'Unlinked', bar: 'bg-inverted/50' },
  restore: { label: 'Restored', bar: 'bg-warning' },
  baseline: { label: 'Recorded state', bar: 'bg-accented' }
}

/** Groups in the restore confirmation, in display order. */
export const RESTORE_GROUPS: { action: RestoreAction, title: string }[] = [
  { action: 'switch', title: 'Switch version' },
  { action: 'link', title: 'Link again' },
  { action: 'unlink', title: 'Unlink (not there yet at that time)' },
  { action: 'missing', title: "Can't restore (that snapshot was deleted)" }
]

/** Bars shown per calendar day before "+n". */
export const MAX_DAY_BARS = 8
