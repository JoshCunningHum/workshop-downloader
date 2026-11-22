// A workshop item's page: the item, its game, snapshots and link, and the actions on them.
export function useItemPage(id: string) {
  const catalog = useCatalog()
  const library = useLibrary()
  const jobsStore = useJobs()
  const toast = useToast()

  // Revisits render the cached data at once, then refresh it in the background.
  let fromCache = false
  const { data, refresh, status } = useAsyncData(`item-${id}`, async () => {
    const item = await catalog.getItem(id)
    if (!item) return null
    return {
      item,
      app: await catalog.getApp(item.appId),
      snapshots: await library.listSnapshots(id),
      link: await library.linkFor(id)
    }
  }, {
    getCachedData: (key, nuxtApp) => {
      fromCache = nuxtApp.payload.data[key] !== undefined
      return nuxtApp.payload.data[key]
    }
  })
  onMounted(() => {
    if (fromCache) refresh()
  })

  const gameVersion = computed(() => data.value?.app?.manualGameVersion || data.value?.app?.detectedGameVersion || null)
  const downloading = computed(() => jobsStore.busyItemIds.value.has(id))

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

  const makeActive = (snapshotId: number) => run('Switching version', async () => {
    const { linked } = await library.activate(snapshotId)
    toast.add({ title: linked ? 'Link now points at this version' : 'Active version set (no mods folder configured, so nothing was linked)', color: 'success' })
  })
  const togglePin = (snapshotId: number, pinned: boolean) => run('Pin', () => library.setPinned(snapshotId, pinned))
  const remove = (snapshotId: number) => run('Delete', () => library.deleteSnapshot(snapshotId))
  const unlink = () => run('Unlink', () => library.unlink(id))
  const redetect = () => run('Version detection', async () => {
    for (const s of data.value!.snapshots) await library.detectVersions(s, data.value!.item, data.value!.app!)
  })
  const download = () => run('Download', () => jobsStore.enqueue(data.value!.item.appId, [id]))
  const setAutoUpdate = (on: boolean) => run('Saving', () => catalog.updateItem(id, { autoUpdate: on }))
  const releaseHold = () => run('Release hold', () => catalog.updateItem(id, { held: false }))

  return { data, refresh, status, gameVersion, downloading, busy, makeActive, togglePin, remove, unlink, redetect, download, setAutoUpdate, releaseHold }
}
