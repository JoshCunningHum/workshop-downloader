import { validateDefinition } from '~/lib/adapters/engine'
import type { AdapterDefinition } from '~/types/adapters'
import { ROUTES } from '~/constants/routes'

// The adapter editor: loads an adapter (or the one being duplicated with ?from=), validates and saves.
export async function useAdapterEditor(routeId: string, from?: string) {
  const adapters = useAdapters()
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

  async function save() {
    try {
      await adapters.save(def.value)
      toast.add({ title: 'Adapter saved', color: 'success' })
      if (isNew) await navigateTo(ROUTES.adapter(def.value.id), { replace: true })
    } catch (e) {
      toast.add({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), color: 'error' })
    }
  }

  async function remove() {
    try {
      await adapters.remove(def.value.id)
      await navigateTo(ROUTES.adapters)
    } catch (e) {
      toast.add({ title: 'Could not delete', description: e instanceof Error ? e.message : String(e), color: 'error' })
    }
  }

  return { isNew, builtin, def, errors, json, save, remove }
}
