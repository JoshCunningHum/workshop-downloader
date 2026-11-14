import * as steam from '~/lib/services/steam'
import type { ItemLibraryInfo } from '~/types/items'
import type { ItemDetails } from '~/types/steam'

// Shared across every caller: one Web API call per item per session.
const detailsCache = new Map<string, Promise<ItemDetails | null>>()

function fetchDetails(id: string): Promise<ItemDetails | null> {
  let pending = detailsCache.get(id)
  if (!pending) {
    pending = steam.itemDetails([id]).then(list => list[0] ?? null)
    pending.catch(() => detailsCache.delete(id))
    detailsCache.set(id, pending)
  }
  return pending.catch(() => null)
}

// Steam details (fetched once and cached) and library info (read on every load) for one item.
export function useItemDetails(itemId: () => string, initial?: ItemDetails | null) {
  const catalog = useCatalog()
  const library = useLibrary()

  const remote = ref<ItemDetails | null>(initial ?? null)
  const loadingRemote = ref(false)
  const local = ref<ItemLibraryInfo | null>(null)

  async function loadRemote() {
    if (remote.value) return
    loadingRemote.value = true
    try {
      remote.value = await fetchDetails(itemId())
    } finally {
      loadingRemote.value = false
    }
  }

  async function loadLocal() {
    const item = await catalog.getItem(itemId())
    if (!item) {
      local.value = null
      return
    }
    const [snapshots, link, app] = await Promise.all([
      library.listSnapshots(item.id),
      library.linkFor(item.id),
      catalog.getApp(item.appId)
    ])
    local.value = {
      title: item.title,
      appName: app?.name ?? null,
      snapshots,
      active: snapshots.find(s => s.id === item.activeSnapshotId) ?? null,
      link,
      autoUpdate: item.autoUpdate,
      pinned: item.pinned,
      addedAt: item.addedAt
    }
  }

  const load = () => Promise.all([loadRemote(), loadLocal()])

  return { remote, loadingRemote, local, load }
}
