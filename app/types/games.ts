import type { ItemRow, LinkRow, SnapshotRow } from '~/lib/db/schema'

/** One workshop item on a game's page, with its snapshots and link. */
export interface GameItemRow {
  item: ItemRow
  active: SnapshotRow | null
  latest: SnapshotRow | null
  count: number
  link: LinkRow | null
  updateAvailable: boolean
  compatible: boolean | null
}
