import type { DiskUsage } from '~/types/games'

// The games in the library with their item counts and library disk usage, as the Games and
// Workshop grids list them. Steam store data (banner, description, ...) is filled in for games
// that lack it, one at a time, updating each card as it arrives. Failures (offline, rate limit)
// are retried next visit.
export function useGameList() {
  const catalog = useCatalog()

  // Revisits render the cached list at once, then refresh it in the background.
  let fromCache = false
  const { data: apps, refresh, status } = useAsyncData('apps', async () => {
    const [rows, counts, usage] = await Promise.all([catalog.listApps(), catalog.itemCountsByApp(), catalog.diskUsageByApp()])
    return rows.map((app) => {
      const u = usage[app.appId]
      const disk: DiskUsage = { active: u?.active ?? 0, inactive: (u?.total ?? 0) - (u?.active ?? 0), total: u?.total ?? 0 }
      return { ...app, items: counts[app.appId] ?? 0, disk }
    })
  }, {
    getCachedData: (key, nuxtApp) => {
      fromCache = nuxtApp.payload.data[key] !== undefined
      return nuxtApp.payload.data[key]
    }
  })
  onMounted(() => {
    if (fromCache) refresh()
  })

  let fetchingStore = false
  watch(apps, async (rows) => {
    if (fetchingStore || !rows) return
    fetchingStore = true
    try {
      for (const row of rows.filter(r => catalog.storeStale(r))) {
        const updated = await catalog.refreshStore(row).catch(() => null)
        if (updated) Object.assign(row, updated)
      }
    } finally {
      fetchingStore = false
    }
  }, { immediate: true })

  return { apps, refresh, status }
}
