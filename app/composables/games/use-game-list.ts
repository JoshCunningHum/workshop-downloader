// The games in the library with their item counts, as the Games and Workshop grids list them.
// Steam store data (banner, description, ...) is filled in for games that lack it, one at a
// time, updating each card as it arrives. Failures (offline, rate limit) are retried next visit.
export function useGameList() {
  const catalog = useCatalog()

  const { data: apps, refresh } = useAsyncData('apps', async () => {
    const [rows, counts] = await Promise.all([catalog.listApps(), catalog.itemCountsByApp()])
    return rows.map(app => ({ ...app, items: counts[app.appId] ?? 0 }))
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

  return { apps, refresh }
}
