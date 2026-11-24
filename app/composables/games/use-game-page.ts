import * as accounts from '~/lib/services/accounts'
import * as snapshots from '~/lib/services/snapshots'

// A game's page: its row, items, snapshots and links, plus the actions in its header.
export function useGamePage(appId: number) {
  const catalog = useCatalog()
  const library = useLibrary()
  const adapters = useAdapters()
  const updates = useUpdateChecker()
  const toast = useToast()

  // Revisits render the cached data at once, then refresh it in the background. The default
  // cache only applies while hydrating; this app is a client-only SPA, so keep the data in
  // memory across visits. Real refreshes (every action's run) must fetch, not reuse the cache.
  let fromCache = false
  const { data, refresh, status } = useAsyncData(`app-${appId}`, async () => {
    const app = await catalog.getApp(appId)
    if (!app) return null
    const items = await catalog.listItems(appId)
    return {
      app,
      items,
      snapshots: await snapshots.listForItems(items.map(i => i.id)),
      links: await library.linksForApp(appId),
      adapter: await adapters.forApp(app),
      adapters: await adapters.list(),
      accounts: await accounts.list()
    }
  }, {
    getCachedData: (key, nuxtApp, ctx) => {
      if (ctx.cause === 'refresh:manual' || ctx.cause === 'refresh:hook') return undefined
      fromCache = nuxtApp.payload.data[key] !== undefined
      return nuxtApp.payload.data[key]
    }
  })
  onMounted(() => {
    if (fromCache) refresh()
  })

  const app = computed(() => data.value?.app ?? null)
  const gameVersion = computed(() => app.value?.manualGameVersion || app.value?.detectedGameVersion || null)

  // Steam store metadata: fetched on open when missing or older than a week.
  watch(app, async (value) => {
    if (!value || !catalog.storeStale(value)) return
    const updated = await catalog.refreshStore(value).catch(() => null)
    if (updated && data.value) data.value.app = updated
  }, { immediate: true })

  /** Runs an action with the page marked busy, then reloads; failures become a toast. */
  const busy = ref(false)
  async function run(label: string, action: () => Promise<unknown>) {
    busy.value = true
    try {
      await action()
      await refresh()
    } catch (e) {
      toast.add({ title: `${label} failed`, description: e instanceof Error ? e.message : String(e), color: 'error' })
    } finally {
      busy.value = false
    }
  }

  const checkUpdates = () => run('Update check', async () => {
    const outdated = await updates.check(appId)
    toast.add({ title: outdated?.length ? `${outdated.length} update(s) available` : 'Everything is up to date', color: 'success' })
  })

  const verifyLinks = () => run('Verify links', async () => {
    const results = await library.verifyLinks(appId)
    const bad = results.filter(r => r.status !== 'ok').length
    toast.add({ title: bad ? `${bad} link(s) need attention` : 'All links are fine', color: bad ? 'warning' : 'success' })
  })

  const detectGameVersion = () => run('Game version detection', async () => {
    const version = await adapters.gameVersion(app.value!)
    await catalog.updateApp(appId, { detectedGameVersion: version })
    toast.add({ title: version ? `Game version ${version}` : 'Could not detect the game version', color: version ? 'success' : 'warning' })
  })

  const detectAdapter = () => run('Adapter detection', async () => {
    const best = await adapters.detectBest(app.value!)
    if (!best) {
      toast.add({ title: 'No adapter found item versions', description: 'None of the adapters for this game could read a supported version from its items.', color: 'warning' })
      return
    }
    await catalog.updateApp(appId, { adapterId: best.adapter.id })
    // Always re-read the stored item versions with the picked adapter (also fixes stale ones).
    await library.redetectApp(appId)
    toast.add({ title: `Adapter: ${best.adapter.name}`, description: `Found supported versions for ${best.matched} of ${best.total} item(s); item versions re-detected.`, color: 'success' })
  })

  return { data, refresh, status, app, gameVersion, busy, run, checkUpdates, verifyLinks, detectGameVersion, detectAdapter }
}

export type GamePage = ReturnType<typeof useGamePage>
