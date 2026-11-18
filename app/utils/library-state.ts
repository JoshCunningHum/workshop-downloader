import type { LibraryState } from '~/lib/services/workshop-browser'

/**
 * Which downloaded items are at Steam's latest revision (`current`) and which have a newer one
 * (`outdated`). Items without a snapshot are left out.
 */
export function libraryState(items: { id: string, remoteTimeUpdated: number }[], latestTimes: Map<string, number>): LibraryState {
  const state: LibraryState = { current: [], outdated: [] }
  for (const item of items) {
    const latest = latestTimes.get(item.id)
    if (latest === undefined) continue
    if (latest >= item.remoteTimeUpdated) state.current.push(item.id)
    else state.outdated.push(item.id)
  }
  return state
}
