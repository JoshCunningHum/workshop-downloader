import { ACTIVE_ORDER } from '~/constants/downloads'
import type { ItemRow } from '~/lib/db/schema'
import type { DownloadRow } from '~/types/downloads'

// The Downloads page's rows: one per item, sorted and split into Active / Finished / Failed,
// with the names, titles and previews to show and what each worker is busy with.
export function useDownloadRows() {
  const jobsStore = useJobs()
  const { settings } = useSettings()
  const catalog = useCatalog()

  const appNames = ref<Record<number, string | null>>({})
  const items = ref<Record<string, ItemRow>>({})

  // Names, titles and previews for what's listed, fetched as new ids appear.
  watch(() => jobsStore.jobs.value.map(j => j.id).join(), async () => {
    const appIds = [...new Set(jobsStore.jobs.value.map(j => j.appId))].filter(id => !(id in appNames.value))
    for (const appId of appIds) appNames.value[appId] = (await catalog.getApp(appId))?.name ?? null
    const itemIds = [...new Set(jobsStore.jobs.value.flatMap(j => j.itemIds))].filter(id => !(id in items.value))
    for (const item of await catalog.itemsByIds(itemIds)) items.value[item.id] = item
  }, { immediate: true })

  const rows = computed<DownloadRow[]>(() => jobsStore.jobs.value.flatMap(job => job.itemIds.map(itemId => ({
    key: `${job.id}:${itemId}`,
    job,
    itemId,
    state: itemState(job, itemId).state
  }))))

  // Speed graphs of rows that are gone (Clear history) are dropped.
  const speed = useItemSpeed()
  watch(() => rows.value.map(r => r.key).join(), () => speed.prune(rows.value.map(r => r.key)))

  // Share of an item downloaded so far (0..1); size falls back to the Web API's file size.
  function ratio(row: DownloadRow) {
    const p = row.job.progress[row.itemId]
    const total = p?.total || items.value[row.itemId]?.fileSize || 0
    return total && p ? Math.min(1, p.bytes / total) : 0
  }

  // Furthest along first; ties: downloading, waiting, queued, then oldest first.
  const active = computed(() => rows.value
    .filter(r => ACTIVE_ORDER.includes(r.state))
    .sort((a, b) => ratio(b) - ratio(a)
      || ACTIVE_ORDER.indexOf(a.state) - ACTIVE_ORDER.indexOf(b.state)
      || a.job.createdAt - b.job.createdAt))
  // Items finished inside a still-running process sort to the top.
  const history = computed(() => rows.value
    .filter(r => !ACTIVE_ORDER.includes(r.state))
    .sort((a, b) => (b.job.finishedAt ?? Infinity) - (a.job.finishedAt ?? Infinity)))
  // Finished downloads split into the ones that made it and the ones that didn't.
  const finished = computed(() => history.value.filter(r => r.state === 'done'))
  const failed = computed(() => history.value.filter(r => r.state !== 'done'))

  // What each worker is downloading right now.
  const workers = computed(() => Array.from({ length: settings.value.concurrency }, (_, slot) => {
    const job = jobsStore.active.value.find(j => j.status === 'running' && j.slot === slot)
    const current = job ? active.value.find(r => r.job === job && r.state === 'downloading') : undefined
    return { slot, job, title: current ? (items.value[current.itemId]?.title || current.itemId) : null }
  }))

  const guarded = computed(() => jobsStore.jobs.value.filter(j => j.guard))

  return { appNames, items, active, finished, failed, workers, guarded }
}
