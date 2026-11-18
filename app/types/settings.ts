export interface AppSettings {
  /** Steam install folder; detected or picked during setup. */
  steamPath: string | null
  /** Where snapshots live. Must be on the same drive as the game for junctions to work well. */
  libraryPath: string | null
  /** Parallel SteamCMD workers. */
  concurrency: number
  /** Items per SteamCMD process; smaller batches spread better across workers. */
  batchSize: number
  /** Periodic update check (only when enabled). */
  updateCheckEnabled: boolean
  updateCheckMinutes: number
  /** Workshop item links (item cards, Workshop browser pop-ups and off-site links) open in the Workshop browser. */
  openItemLinksInWorkshop: boolean
}
