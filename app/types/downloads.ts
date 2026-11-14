import type { ItemState, LiveJob } from './jobs'

/** One workshop item on the Downloads page, whichever SteamCMD process it runs in. */
export interface DownloadRow { key: string, job: LiveJob, itemId: string, state: ItemState }

export type DownloadTab = 'active' | 'finished' | 'failed'
