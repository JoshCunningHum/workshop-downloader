import type { AppRow, SteamAppRow } from '~/lib/db/schema'
import * as appIndex from '~/lib/services/app-index'

// The games listed in the sidebar selector and the one currently selected.
// Shared state so that anything creating apps (setup scan, main input) can refresh the list.
export function useAppSelection() {
  const apps = useState<AppRow[]>('apps:list', () => [])
  // Steam's anonymous dedicated-server apps (see lib/services/app-index); searchable, not yet games.
  const index = useState<SteamAppRow[]>('apps:index', () => [])
  const current = useState<number | null>('apps:current', () => null)
  // Workshop items per app, for the sidebar badges.
  const itemCounts = useState<Record<number, number>>('apps:itemCounts', () => ({}))
  const catalog = useCatalog()

  async function refreshCounts() {
    itemCounts.value = await catalog.itemCountsByApp()
  }

  async function refresh() {
    [apps.value, index.value] = await Promise.all([catalog.listApps(), appIndex.list(), refreshCounts()])
  }

  return { apps, index, current, itemCounts, refresh, refreshCounts }
}
