import type { QueueEntry } from '~/types/downloads'
import type { ItemDetails } from '~/types/steam'

/**
 * Queue entries for resolved Web API items: only items Steam returned (result 1) for a known app.
 * An item whose newest snapshot is at least Steam's latest revision is queued unticked.
 */
export function toQueueEntries(details: ItemDetails[], latestTimes: Map<string, number>, appNames: Record<string, string>): QueueEntry[] {
  return details
    .filter(d => d.result === 1 && d.appId)
    .map((details) => {
      const latest = latestTimes.get(details.id)
      const downloaded = latest !== undefined && latest >= details.timeUpdated
      return { details, appName: appNames[details.appId] ?? null, checked: !downloaded, downloaded, hasSnapshot: latest !== undefined }
    })
}
