import * as accounts from '~/lib/services/accounts'
import * as snapshots from '~/lib/services/snapshots'

// A game's page: its row, items, snapshots and links, plus the actions in its header.
export function useGamePage(appId: number) {
  const catalog = useCatalog()
  const library = useLibrary()
  const adapters = useAdapters()
  const updates = useUpdateChecker()
  const toast = useToast()

  const { data, refresh } = useAsyncData(`app-${appId}`, async () => {
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

  return { data, refresh, app, gameVersion, busy, run, checkUpdates, verifyLinks, detectGameVersion }
}

export type GamePage = ReturnType<typeof useGamePage>
