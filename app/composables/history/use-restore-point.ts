import type { RestorePointRow, SnapshotEventRow } from '~/lib/db/schema'
import * as items from '~/lib/services/items'
import * as links from '~/lib/services/links'
import * as restorePoints from '~/lib/services/restore-points'
import * as snapshotEvents from '~/lib/services/snapshot-events'
import type { GamePage } from '../games/use-game-page'

// A game's history view: its change log by day, saved restore points, a chosen point in time,
// and restoring to either.
export function useRestorePoint(appId: number, page: Pick<GamePage, 'data' | 'run'>) {
  const library = useLibrary()
  const catalog = useCatalog()
  const toast = useToast()
  const { data, run } = page

  const events = ref<SnapshotEventRow[]>([])
  const points = ref<RestorePointRow[]>([])
  const reload = async () => {
    [events.value, points.value] = await Promise.all([snapshotEvents.forApp(appId), restorePoints.forApp(appId)])
  }

  const byDay = computed(() => eventsByDay(events.value))
  const pointsByDay = computed(() => {
    const days = new Map<string, RestorePointRow[]>()
    for (const p of points.value) {
      const key = dayKey(p.createdAt)
      days.set(key, [...(days.get(key) ?? []), p])
    }
    return days
  })
  const day = ref<string | null>(null)
  const dayEvents = computed(() => (day.value ? byDay.value.get(day.value) ?? [] : []))
  const dayPoints = computed(() => (day.value ? pointsByDay.value.get(day.value) ?? [] : []))
  const range = computed(() => timelineRange([...dayEvents.value, ...dayPoints.value.map(p => ({ at: p.createdAt }))]))

  // The chosen moment; starts at the end of the day's timeline (everything that day applied).
  const point = ref(0)
  watch(range, (r) => {
    if (r) point.value = r.end
  })

  const itemMap = computed(() => new Map((data.value?.items ?? []).map(i => [i.id, i])))
  const snapshots = computed(() => new Map((data.value?.snapshots ?? []).map(s => [s.id, s])))
  const current = () => new Map<string, number | null>((data.value?.links ?? []).map(l => [l.itemId, l.snapshotId]))

  /** Changes to get back to `point` on the ruler, for items still in the game. */
  const plan = computed(() => {
    if (!data.value || !range.value) return []
    return planRestore({ events: events.value, t: point.value, current: current(), existing: new Set(snapshots.value.keys()) })
      .filter(c => itemMap.value.has(c.itemId))
  })
  const applicable = computed(() => plan.value.filter(c => c.action !== 'missing'))

  // --- Confirming and applying ---------------------------------------------------------------

  /** A saved point being restored (its recorded state), or null for the ruler's point. */
  const savedTarget = ref<RestorePointRow | null>(null)
  const confirming = ref(false)
  const hold = ref(true)
  watch(confirming, (open) => {
    if (!open) savedTarget.value = null
  })

  const confirmPlan = computed(() => {
    const saved = savedTarget.value
    if (!saved) return plan.value
    return diffStates(new Map(Object.entries(saved.state)), current(), new Set(snapshots.value.keys()))
      .filter(c => itemMap.value.has(c.itemId))
  })
  const confirmTitle = computed(() => savedTarget.value
    ? `Restore "${savedTarget.value.label || 'Saved restore point'}" (${formatMs(savedTarget.value.createdAt)})`
    : `Restore to ${formatMs(point.value)}`)

  function confirmSaved(saved: RestorePointRow) {
    savedTarget.value = saved
    confirming.value = true
  }

  function restore() {
    const changes = confirmPlan.value.filter(c => c.action !== 'missing')
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
          failed.push(`${itemMap.value.get(change.itemId)?.title || change.itemId}: ${e instanceof Error ? e.message : String(e)}`)
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

  // --- Saved points --------------------------------------------------------------------------

  /** Records which snapshot every item of the game has linked right now (null: not linked). */
  async function savePoint(label: string) {
    const [rows, linked] = await Promise.all([items.listForApp(appId), links.forApp(appId)])
    const byItem = new Map(linked.map(l => [l.itemId, l.snapshotId]))
    const state = Object.fromEntries(rows.map(i => [i.id, byItem.get(i.id) ?? null]))
    await restorePoints.create({ appId, label: label.trim() || null, state })
    await reload()
    toast.add({ title: 'Restore point saved', description: `${byItem.size} linked item(s) recorded; their snapshots are kept until you delete it.`, color: 'success' })
  }

  async function deletePoint(saved: RestorePointRow) {
    await restorePoints.remove(saved.id)
    await reload()
    toast.add({ title: 'Restore point deleted', description: 'Its snapshots follow the game\'s cleanup rule again.', color: 'success' })
  }

  /** Shows a saved point's day with the ruler at its time. */
  function showPoint(saved: RestorePointRow) {
    day.value = dayKey(saved.createdAt)
    nextTick(() => {
      point.value = saved.createdAt
    })
  }

  return {
    events, points, reload, byDay, pointsByDay, day, dayEvents, dayPoints, range, point,
    items: itemMap, snapshots, plan, applicable,
    confirming, confirmPlan, confirmTitle, hold, restore, confirmSaved,
    savePoint, deletePoint, showPoint
  }
}

export type RestorePoint = ReturnType<typeof useRestorePoint>
