import type { ItemRow, LinkRow, SnapshotRow } from '~/lib/db/schema'

/** One workshop item on a game's page, with its snapshots and link. */
export interface GameItemRow {
  item: ItemRow
  active: SnapshotRow | null
  latest: SnapshotRow | null
  /** Every downloaded revision, newest first; the active cell lists them. */
  snapshots: SnapshotRow[]
  count: number
  link: LinkRow | null
  updateAvailable: boolean
}

/** A game's snapshots on disk: the active ones, the inactive ones, and their total. */
export interface DiskUsage {
  active: number
  inactive: number
  total: number
}
