import { validateDefinition } from '~/lib/adapters/engine'
import type { AdapterDefinition } from '~/types/adapters'
import { ROUTES } from '~/constants/routes'

// The adapter editor: loads an adapter (or the one being duplicated with ?from=), validates and saves.
export async function useAdapterEditor(routeId: string, from?: string) {
  const adapters = useAdapters()
  const library = useLibrary()
  const toast = useToast()

  const isNew = routeId === 'new'
  const builtin = ref(false)
  const def = ref<AdapterDefinition>({ id: '', name: '', appId: null, linkName: '{itemId}', gameVersion: [], itemVersions: [] })

  const sourceId = isNew ? from : routeId
  if (sourceId) {
    const row = await adapters.get(sourceId)
    if (row) {
      def.value = structuredClone(toRaw(row.definition))
      builtin.value = !isNew && row.builtin
      if (isNew) {
        def.value.id = `${row.id}-copy`
        def.value.name = `${row.name} (copy)`
      }
    }
  }

  const errors = computed(() => validateDefinition(def.value))
  const json = computed(() => JSON.stringify(def.value, null, 2))

  /** Re-reads item versions of the given apps; returns how many apps were updated. */
  async function redetect(appIds: number[]) {
    for (const appId of appIds) await library.redetectApp(appId)
    return appIds.length
  }

  async function save() {
    try {
      const before = isNew ? null : await adapters.get(def.value.id)
      await adapters.save(def.value)
      // New or changed version rules: re-read item versions of the games that use this adapter.
      const rulesChanged = !before || JSON.stringify(before.definition.itemVersions ?? []) !== JSON.stringify(def.value.itemVersions ?? [])
      const games = rulesChanged ? await redetect((await adapters.appsUsing(def.value.id)).map(a => a.appId)) : 0
      toast.add({
        title: 'Adapter saved',
        description: games ? `Re-detected item versions for ${games} game(s).` : undefined,
        color: 'success'
      })
      if (isNew) await navigateTo(ROUTES.adapter(def.value.id), { replace: true })
    } catch (e) {
      toast.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), color: 'error' })
    }
  }

  async function remove() {
    try {
      // The games using it fall back to another adapter, so their item versions are re-read.
      const users = (await adapters.appsUsing(def.value.id)).map(a => a.appId)
      await adapters.remove(def.value.id)
      const games = await redetect(users)
      if (games) toast.add({ title: 'Adapter deleted', description: `Re-detected item versions for ${games} game(s).`, color: 'success' })
      await navigateTo(ROUTES.adapters)
    } catch (e) {
      toast.add({ title: 'Could not delete', description: e instanceof Error ? e.message : String(e), color: 'error' })
    }
  }

  return { isNew, builtin, def, errors, json, save, remove }
}
