import * as snapshots from '~/lib/services/snapshots'
import * as steam from '~/lib/services/steam'
import type { DownloadTab, QueueEntry } from '~/types/downloads'

// Pasted items waiting to be downloaded. Lives for the session (not saved).
const state = reactive({ entries: [] as QueueEntry[] })

// The pending downloads: pasting workshop links/ids resolves them with Steam and adds them here
// (already-downloaded revisions unticked); "Download" starts the ticked ones.
export function useDownloadQueue() {
  const catalog = useCatalog()
  const jobsStore = useJobs()
  const selection = useAppSelection()
  const toast = useToast()
  const route = useRoute()
  /** The selected Downloads tab; switches to the queue when items are added. */
  const tab = useState<DownloadTab>('downloads:tab', () => 'active')

  const adding = ref(false)
  const downloading = ref(false)

  const entries = computed(() => state.entries)
  const checked = computed(() => state.entries.filter(e => e.checked))
  const allChecked = computed(() => state.entries.length > 0 && checked.value.length === state.entries.length)

  /** Adds games seen for the first time so they show up in the sidebar selector. */
  async function addNewApps(appIds: number[], appNames: Record<string, string>) {
    const known = new Set(selection.apps.value.map(a => a.appId))
    const fresh = [...new Set(appIds)].filter(id => !known.has(id))
    if (!fresh.length) return
    for (const appId of fresh) await catalog.ensureApp(appId, appNames[appId])
    await selection.refresh()
    // On a game page the sidebar stays on that game.
    if (fresh.length === 1 && !route.params.appId) selection.current.value = fresh[0]!
  }

  /** Resolves pasted text (ids, links, collections) and queues the items. Returns how many were queued. */
  async function add(text: string): Promise<number> {
    const ids = parseWorkshopIds(text)
    if (!ids.length) return 0
    adding.value = true
    try {
      const resolved = await steam.resolve(ids)
      const usable = resolved.items.filter(i => i.result === 1 && i.appId)
      const problems = resolved.items.filter(i => i.result !== 1 || !i.appId)
      if (problems.length) {
        toast.add({
          title: `${problems.length} item(s) not downloadable`,
          description: problems.map(i => `${i.id}: ${i.result === 9 ? 'not found (removed or private)' : `Steam result ${i.result}`}`).join('\n'),
          color: 'warning'
        })
      }
      if (!usable.length) return 0

      const latest = await snapshots.latestTimes(usable.map(i => i.id))
      const appNames = await steam.appNames([...new Set(usable.map(i => i.appId))]).catch(() => ({}))
      await addNewApps(usable.map(i => i.appId), appNames)

      // A re-pasted item is refreshed in place; new ones go to the end.
      for (const entry of toQueueEntries(usable, latest, appNames)) {
        const at = state.entries.findIndex(e => e.details.id === entry.details.id)
        if (at >= 0) state.entries[at] = entry
        else state.entries.push(entry)
      }
      tab.value = 'queue'
      return usable.length
    } catch (e) {
      toast.add({ title: 'Could not resolve items', description: e instanceof Error ? e.message : String(e), color: 'error' })
      return 0
    } finally {
      adding.value = false
    }
  }

  function toggle(id: string, on: boolean | 'indeterminate') {
    const entry = state.entries.find(e => e.details.id === id)
    if (entry) entry.checked = on === true
  }

  function toggleAll(on: boolean | 'indeterminate') {
    for (const entry of state.entries) entry.checked = on === true
  }

  function remove(id: string) {
    state.entries.splice(0, state.entries.length, ...state.entries.filter(e => e.details.id !== id))
  }

  function clear() {
    state.entries.splice(0, state.entries.length)
  }

  /** Starts downloads for the ticked items (per game); they leave the queue. */
  async function download() {
    downloading.value = true
    try {
      const busy = jobsStore.busyItemIds.value
      const byApp = new Map<number, QueueEntry[]>()
      for (const entry of checked.value) {
        if (!byApp.has(entry.details.appId)) byApp.set(entry.details.appId, [])
        byApp.get(entry.details.appId)!.push(entry)
      }
      let count = 0
      let skipped = 0
      for (const [appId, group] of byApp) {
        await catalog.ensureApp(appId, group[0]!.appName ?? undefined)
        await catalog.upsertItems(group.map(e => e.details))
        const ids = group.map(e => e.details.id).filter(id => !busy.has(id))
        skipped += group.length - ids.length
        if (ids.length) {
          await jobsStore.enqueue(appId, ids)
          count += ids.length
        }
        for (const entry of group) remove(entry.details.id)
      }
      toast.add({
        title: count ? `Queued ${count} item(s)` : 'Nothing new to download',
        description: skipped ? `${skipped} item(s) were already downloading.` : undefined,
        color: 'success'
      })
      if (count) tab.value = 'active'
    } catch (e) {
      toast.add({ title: 'Could not queue downloads', description: e instanceof Error ? e.message : String(e), color: 'error' })
    } finally {
      downloading.value = false
    }
  }

  return { entries, checked, allChecked, tab, adding, downloading, add, toggle, toggleAll, remove, clear, download }
}
