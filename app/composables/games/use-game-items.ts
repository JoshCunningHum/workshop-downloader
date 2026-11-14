import { isCompatible } from '~/lib/adapters/engine'
import type { SnapshotRow } from '~/lib/db/schema'
import type { GameItemRow } from '~/types/games'
import type { GamePage } from './use-game-page'

// The item table of a game's page: rows, selection, and download/link/unlink/remove.
export function useGameItems(appId: number, page: Pick<GamePage, 'data' | 'gameVersion' | 'run'>) {
  const library = useLibrary()
  const jobsStore = useJobs()
  const toast = useToast()
  const { data, gameVersion, run } = page

  const rows = computed<GameItemRow[]>(() => {
    if (!data.value) return []
    const byItem = new Map<string, SnapshotRow[]>()
    for (const s of data.value.snapshots) {
      if (!byItem.has(s.itemId)) byItem.set(s.itemId, [])
      byItem.get(s.itemId)!.push(s)
    }
    return data.value.items.map((item) => {
      const snaps = (byItem.get(item.id) ?? []).sort((a, b) => b.timeUpdated - a.timeUpdated)
      const active = snaps.find(s => s.id === item.activeSnapshotId) ?? null
      const latest = snaps[0] ?? null
      return {
        item,
        active,
        latest,
        count: snaps.length,
        link: data.value!.links.find(l => l.itemId === item.id) ?? null,
        updateAvailable: item.remoteTimeUpdated > (latest?.timeUpdated ?? 0),
        compatible: isCompatible(gameVersion.value, active?.itemVersions ?? [])
      }
    })
  })
  const outdatedIds = computed(() => rows.value.filter(r => r.updateAvailable).map(r => r.item.id))

  // The table shows the rows whose title or id contains the search text.
  const search = ref('')
  const visibleRows = computed(() => {
    const needle = search.value.trim().toLowerCase()
    if (!needle) return rows.value
    return rows.value.filter(r => r.item.title.toLowerCase().includes(needle) || r.item.id.includes(needle))
  })

  const selected = ref(new Set<string>())
  const allSelected = computed(() => visibleRows.value.length > 0 && visibleRows.value.every(r => selected.value.has(r.item.id)))
  const selectedRows = () => rows.value.filter(r => selected.value.has(r.item.id))

  /** Ticks or unticks the visible rows (others keep their state). */
  function toggleAll(on: boolean | 'indeterminate') {
    const next = new Set(selected.value)
    for (const r of visibleRows.value) {
      if (on === true) next.add(r.item.id)
      else next.delete(r.item.id)
    }
    selected.value = next
  }

  function toggle(id: string, on: boolean | 'indeterminate') {
    const next = new Set(selected.value)
    if (on === true) next.add(id)
    else next.delete(id)
    selected.value = next
  }

  function download(ids: string[]) {
    return run('Download', async () => {
      const busyIds = jobsStore.busyItemIds.value
      const queue = ids.filter(id => !busyIds.has(id))
      if (!queue.length) throw new Error('Those items are already downloading')
      await jobsStore.enqueue(appId, queue)
      toast.add({ title: `Queued ${queue.length} item(s)`, color: 'success' })
    })
  }

  function link(target: GameItemRow[]) {
    return run('Link', async () => {
      for (const row of target) {
        const snapshot = row.active ?? row.latest
        if (snapshot) await library.activate(snapshot.id)
      }
    })
  }

  function unlink(target: GameItemRow[]) {
    return run('Unlink', async () => {
      for (const row of target) await library.unlink(row.item.id)
    })
  }

  function remove(target: GameItemRow[]) {
    return run('Remove', async () => {
      for (const row of target) await library.removeItem(row.item.id)
      selected.value = new Set()
    })
  }

  return { rows, visibleRows, search, outdatedIds, selected, allSelected, selectedRows, toggle, toggleAll, download, link, unlink, remove }
}
