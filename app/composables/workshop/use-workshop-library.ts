import type { MaybeRefOrGetter } from 'vue'
import * as items from '~/lib/services/items'
import * as snapshots from '~/lib/services/snapshots'
import * as browser from '~/lib/services/workshop-browser'

// Tells the Workshop browser which items are already downloaded, so its buttons show
// "Downloaded" (add disabled) or "Update" (outdated). Steam's latest revisions of the game's items
// are refreshed once per game shown; the state is pushed again whenever downloads finish.
export function useWorkshopLibrary(appId: MaybeRefOrGetter<number>) {
  const catalog = useCatalog()
  const jobsStore = useJobs()

  async function push() {
    const rows = await items.listAll()
    const latest = await snapshots.latestTimes(rows.map(r => r.id))
    await browser.setLibrary(libraryState(rows, latest))
  }

  async function refresh() {
    // Push what's stored right away, then again once Steam's revisions are fresh.
    await push().catch(() => {})
    await catalog.checkUpdates(toValue(appId)).catch(() => {})
    await push().catch(() => {})
  }

  watch(() => toValue(appId), refresh)

  // A finished item becomes "Downloaded".
  watchDebounced(
    () => jobsStore.jobs.value.map(j => `${j.id}:${Object.keys(j.itemsDone).length}`).join(),
    () => push().catch(() => {}),
    { debounce: 1000 }
  )

  return { refresh }
}
