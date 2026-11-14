import * as steam from '~/lib/services/steam'
import type { ItemDetails, Resolved } from '~/types/steam'

// The workshop link input: parses pasted ids/links, resolves them with Steam, groups the items
// by game (adding games seen for the first time) and queues the chosen ones for download.
export function useWorkshopResolve(onQueued?: () => void) {
  const catalog = useCatalog()
  const jobsStore = useJobs()
  const selection = useAppSelection()
  const toast = useToast()
  const route = useRoute()

  const input = ref('')
  const resolving = ref(false)
  const queuing = ref(false)
  const resolved = ref<Resolved | null>(null)
  const skipDownloaded = ref(true)
  const latest = ref(new Map<string, number>())
  const appNames = ref<Record<string, string>>({})
  const excluded = ref(new Set<string>())

  const ids = computed(() => parseWorkshopIds(input.value))
  const invalid = computed(() => !!input.value.trim() && !ids.value.length)

  const usable = computed(() => resolved.value?.items.filter(i => i.result === 1 && i.appId) ?? [])
  const problems = computed(() => resolved.value?.items.filter(i => i.result !== 1 || !i.appId) ?? [])

  // Items grouped by the AppID the Web API reports (consumer_app_id).
  const groups = computed(() => {
    const map = new Map<number, ItemDetails[]>()
    for (const item of usable.value) {
      if (!map.has(item.appId)) map.set(item.appId, [])
      map.get(item.appId)!.push(item)
    }
    return [...map.entries()].map(([appId, items]) => ({ appId, items }))
  })

  const isCurrent = (item: ItemDetails) => (latest.value.get(item.id) ?? 0) >= item.timeUpdated
  const willDownload = (item: ItemDetails) => !excluded.value.has(item.id) && !(skipDownloaded.value && isCurrent(item))
  const downloadCount = (items: ItemDetails[]) => items.filter(item => willDownload(item)).length

  /** Adds games seen for the first time so they show up in the sidebar selector. */
  async function addNewApps(appIds: number[]) {
    const known = new Set(selection.apps.value.map(a => a.appId))
    const fresh = appIds.filter(id => !known.has(id))
    if (!fresh.length) return
    for (const appId of fresh) await catalog.ensureApp(appId, appNames.value[appId])
    await selection.refresh()
    // On a game page the sidebar stays on that game.
    if (fresh.length === 1 && !route.params.appId) selection.current.value = fresh[0]!
  }

  async function resolve() {
    if (!ids.value.length) return
    resolving.value = true
    resolved.value = null
    excluded.value = new Set()
    try {
      const result = await steam.resolve(ids.value)
      resolved.value = result
      latest.value = await catalog.latestSnapshotTimes(result.items.map(i => i.id))
      appNames.value = await steam.appNames(groups.value.map(g => g.appId)).catch(() => ({}))
      await addNewApps(groups.value.map(g => g.appId))
    } catch (e) {
      toast.add({ title: 'Could not resolve items', description: e instanceof Error ? e.message : String(e), color: 'error' })
    } finally {
      resolving.value = false
    }
  }

  function toggle(id: string, on: boolean | 'indeterminate') {
    const next = new Set(excluded.value)
    if (on) next.delete(id)
    else next.add(id)
    excluded.value = next
  }

  async function queue(appIds: number[]) {
    queuing.value = true
    try {
      let count = 0
      for (const appId of appIds) {
        const items = groups.value.find(g => g.appId === appId)?.items ?? []
        await catalog.ensureApp(appId, appNames.value[appId])
        await catalog.upsertItems(items)
        const chosen = items.filter(item => willDownload(item)).map(i => i.id)
        if (chosen.length) {
          await jobsStore.enqueue(appId, chosen)
          count += chosen.length
        }
      }
      toast.add({ title: count ? `Queued ${count} item(s)` : 'Saved; nothing new to download', color: 'success' })
      if (count) clear()
      onQueued?.()
    } catch (e) {
      toast.add({ title: 'Could not queue downloads', description: e instanceof Error ? e.message : String(e), color: 'error' })
    } finally {
      queuing.value = false
    }
  }

  function clear() {
    input.value = ''
    resolved.value = null
  }

  // Editing the input invalidates an earlier result.
  watch(input, () => {
    resolved.value = null
  })

  return { input, ids, invalid, resolving, queuing, resolved, skipDownloaded, latest, appNames, excluded, groups, problems, isCurrent, downloadCount, resolve, toggle, queue }
}
