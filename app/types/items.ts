import type { LinkRow, SnapshotRow } from '~/lib/db/schema'

/** What the library knows about a workshop item (for its detail card). */
export interface ItemLibraryInfo {
  title: string | null
  appName: string | null
  snapshots: SnapshotRow[]
  active: SnapshotRow | null
  link: LinkRow | null
  autoUpdate: boolean
  pinned: boolean
  addedAt: number
}
