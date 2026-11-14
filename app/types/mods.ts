import type { ItemDetails } from './steam'

// Mirrors src-tauri/src/mods.rs FoundFolder.
export interface FoundFolder {
  itemId: string
  path: string
  kind: 'folder' | 'library' | 'link'
  modified: number | null
}

export type ImportStatus
  = | 'ready' // can be imported
    | 'managed' // already a link into the library
    | 'link' // a link pointing elsewhere; left alone
    | 'notFound' // Steam doesn't know the id (or it's removed/private)
    | 'otherGame' // a workshop item of another app
    | 'exists' // that revision is already in the library

export interface ImportCandidate {
  itemId: string
  path: string
  status: ImportStatus
  reason: string | null
  details: ItemDetails | null
  /** Revision recorded for the snapshot: the folder's newest file time, capped at Steam's. */
  timeUpdated: number
}
