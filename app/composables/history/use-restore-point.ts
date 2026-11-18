import type { SnapshotEventRow } from '~/lib/db/schema'
import * as snapshotEvents from '~/lib/services/snapshot-events'
import type { GamePage } from '../games/use-game-page'

// A game's history view: its change log by day, a chosen point in time, and restoring to it.
export function useRestorePoint(appId: number, page: Pick<GamePage, 'data' | 'run'>) {
  const library = useLibrary()
  const catalog = useCatalog()
  const toast = useToast()
  const { data, run } = page

  const events = ref<SnapshotEventRow[]>([])
  const reload = async () => {
    events.value = await snapshotEvents.forApp(appId)
  }

  const byDay = computed(() => eventsByDay(events.value))
  const day = ref<string | null>(null)
  const dayEvents = computed(() => (day.value ? byDay.value.get(day.value) ?? [] : []))
  const range = computed(() => timelineRange(dayEvents.value))

  // The chosen moment; starts at the end of the day's timeline (everything that day applied).
  const point = ref(0)
  watch(range, (r) => {
    if (r) point.value = r.end
  })

  const items = computed(() => new Map((data.value?.items ?? []).map(i => [i.id, i])))
  const snapshots = computed(() => new Map((data.value?.snapshots ?? []).map(s => [s.id, s])))

  /** Changes to get back to `point`, for items still in the game. */
  const plan = computed(() => {
    if (!data.value || !range.value) return []
    const current = new Map<string, number | null>(data.value.links.map(l => [l.itemId, l.snapshotId]))
    return planRestore({ events: events.value, t: point.value, current, existing: new Set(snapshots.value.keys()) })
      .filter(c => items.value.has(c.itemId))
  })
  const applicable = computed(() => plan.value.filter(c => c.action !== 'missing'))

  const confirming = ref(false)
  const hold = ref(true)

  function restore() {
    const changes = applicable.value
    const holdChanged = hold.value
    confirming.value = false
    return run('Restore', async () => {
      const failed: string[] = []
      for (const change of changes) {
        try {
          if (change.to === null) await library.unlink(change.itemId, { reason: 'restore' })
          else await library.activate(change.to, { reason: 'restore' })
          if (holdChanged) await catalog.updateItem(change.itemId, { held: true })
        } catch (e) {
          failed.push(`${items.value.get(change.itemId)?.title || change.itemId}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      await reload()
      const done = changes.length - failed.length
      toast.add({
        title: failed.length ? `Restored ${done} of ${changes.length} item(s)` : `Restored ${done} item(s)`,
        description: failed.join('\n') || undefined,
        color: failed.length ? 'warning' : 'success'
      })
    })
  }

  return { events, reload, byDay, day, dayEvents, range, point, items, snapshots, plan, applicable, confirming, hold, restore }
}

export type RestorePoint = ReturnType<typeof useRestorePoint>
