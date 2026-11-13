import type { AppRow, SteamAppRow } from '~/db/schema'

// The games listed in the sidebar selector and the one currently selected.
// Shared state so that anything creating apps (setup scan, main input) can refresh the list.
export function useAppSelection() {
  const apps = useState<AppRow[]>('apps:list', () => [])
  // Steam's anonymous dedicated-server apps (see useSteamAppIndex); searchable, not yet games.
  const index = useState<SteamAppRow[]>('apps:index', () => [])
  const current = useState<number | null>('apps:current', () => null)
  const catalog = useCatalog()
  const steamIndex = useSteamAppIndex()

  async function refresh() {
    [apps.value, index.value] = await Promise.all([catalog.listApps(), steamIndex.list()])
  }

  return { apps, index, current, refresh }
}
