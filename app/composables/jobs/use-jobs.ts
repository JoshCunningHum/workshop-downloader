import { ACTIVE_JOB_STATUSES as ACTIVE, HISTORY_LIMIT } from '~/constants/jobs'
import { channel } from '~/lib/api/tauri'
import * as accounts from '~/lib/services/accounts'
import * as jobsDb from '~/lib/services/jobs'
import type { JobEvent, LiveJob } from '~/types/jobs'

const state = reactive({ jobs: [] as LiveJob[], loaded: false })
// Events of one job are handled strictly in order (snapshot writes must finish before "finished").
const chains = new Map<string, Promise<void>>()

// SteamCMD download jobs: the live list, queueing, cancelling and retrying.
export function useJobs() {
  const { settings } = useSettings()
  const catalog = useCatalog()
  const { handle } = useJobEvents()

  /** Marks jobs left running by a previous session as interrupted and loads recent history. */
  async function loadHistory() {
    if (state.loaded) return
    state.loaded = true
    await jobsDb.interrupt(ACTIVE)
    const rows = await jobsDb.recent(HISTORY_LIMIT)
    state.jobs.push(...rows.map(row => ({
      ...historyItems(row.status, row.itemIds, row.error),
      id: row.id,
      appId: row.appId,
      itemIds: row.itemIds,
      accountId: row.accountId,
      status: row.status,
      slot: row.workerSlot,
      progress: {},
      bytesTotal: row.bytesTotal,
      log: row.logTail ? row.logTail.split('\n') : [],
      error: row.error,
      guard: null,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt
    })))
  }

  /** Queues downloads for items of one app, split into batches across workers. */
  async function enqueue(appId: number, itemIds: string[], options: { accountId?: number | null, guardCode?: string } = {}) {
    if (!settings.value.libraryPath) throw new Error('Set a library folder in Settings first')
    const app = await catalog.getApp(appId)
    const accountId = options.accountId !== undefined ? options.accountId : app?.accountId ?? null
    const items = await catalog.itemsForApp(appId, itemIds)
    const size = Math.max(1, settings.value.batchSize)
    const started: string[] = []
    for (let i = 0; i < items.length; i += size) {
      started.push(await startJob(appId, items.slice(i, i + size), accountId, options.guardCode))
    }
    return started
  }

  async function startJob(appId: number, items: { id: string, remoteTimeUpdated: number, fileSize: number }[], accountId: number | null, guardCode?: string) {
    const id = `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const account = accountId !== null ? await accounts.get(accountId) : null
    const createdAt = Date.now()
    const itemIds = items.map(i => i.id)
    const bytesTotal = items.reduce((sum, i) => sum + i.fileSize, 0)

    await jobsDb.insert({ id, appId, itemIds, accountId, status: 'queued', bytesTotal, createdAt })
    state.jobs.unshift({
      id, appId, itemIds, accountId, status: 'queued', slot: null, progress: {}, bytesTotal, itemErrors: {}, itemsDone: {},
      log: [], error: null, guard: null, createdAt, startedAt: null, finishedAt: null
    })
    const job = state.jobs[0]!

    const onEvent = channel<JobEvent>((event) => {
      const next = (chains.get(id) ?? Promise.resolve())
        .then(() => handle(job, event))
        .then(() => {
          if (event.type === 'finished') chains.delete(id)
        })
        .catch((e) => {
          job.log.push(`[app] ${e instanceof Error ? e.message : String(e)}`)
        })
      chains.set(id, next)
    })

    try {
      await jobsDb.start({
        jobId: id,
        appId,
        items: items.map(i => ({ id: i.id, timeUpdated: i.remoteTimeUpdated, fileSize: i.fileSize })),
        libraryPath: settings.value.libraryPath,
        account: account?.username ?? null,
        guardCode: guardCode ?? null
      }, onEvent)
    } catch (e) {
      await handle(job, { type: 'finished', status: 'failed', error: e instanceof Error ? e.message : String(e) })
      chains.delete(id)
    }
    return id
  }

  const cancel = jobsDb.cancel

  /** Re-runs a job that stopped for Steam Guard with the code the user entered. */
  async function submitGuardCode(job: LiveJob, code: string) {
    job.guard = null
    return enqueue(job.appId, job.itemIds, { accountId: job.accountId, guardCode: code.trim() })
  }

  /** Re-queues the items of a job that didn't finish downloading. */
  function retry(job: LiveJob) {
    const failed = job.status === 'partial' ? Object.keys(job.itemErrors) : job.itemIds
    return enqueue(job.appId, failed, { accountId: job.accountId })
  }

  /** Re-queues a single item of a job. */
  function retryItem(job: LiveJob, itemId: string) {
    return enqueue(job.appId, [itemId], { accountId: job.accountId })
  }

  async function clearFinished() {
    const finished = state.jobs.filter(j => !ACTIVE.includes(j.status))
    await jobsDb.removeMany(finished.map(j => j.id))
    state.jobs.splice(0, state.jobs.length, ...state.jobs.filter(j => ACTIVE.includes(j.status)))
  }

  const active = computed(() => state.jobs.filter(j => ACTIVE.includes(j.status)))
  const busyItemIds = computed(() => new Set(active.value.flatMap(j => j.itemIds)))

  return { jobs: computed(() => state.jobs), active, busyItemIds, loadHistory, enqueue, cancel, submitGuardCode, retry, retryItem, clearFinished }
}
