import type { ItemState, LiveJob } from './jobs'
import type { ItemDetails } from './steam'

/** One workshop item on the Downloads page, whichever SteamCMD process it runs in. */
export interface DownloadRow { key: string, job: LiveJob, itemId: string, state: ItemState }

/** A pasted item waiting in the queue to be downloaded. */
export interface QueueEntry {
  details: ItemDetails
  appName: string | null
  /** Ticked items are downloaded by "Download". */
  checked: boolean
  /** Its latest revision is already in the library. */
  downloaded: boolean
  /** An older revision is in the library (so this would be an update). */
  hasSnapshot: boolean
}

export type DownloadTab = 'queue' | 'active' | 'finished' | 'failed'
