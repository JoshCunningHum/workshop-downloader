import { Channel, invoke } from '@tauri-apps/api/core'
import { desc, eq, inArray } from 'drizzle-orm'
import { jobs, type JobStatus } from '~/db/schema'

// Mirrors src-tauri/src/steamcmd/job.rs JobEvent.
export type GuardKind = 'email' | 'twoFactor'
export type JobEvent
  = | { type: 'queued' }
    | { type: 'started', slot: number }
    | { type: 'log', line: string }
    | { type: 'progress', itemId: string, bytes: number, total: number }
    | { type: 'itemDone', itemId: string, timeUpdated: number, path: string, sizeBytes: number }
    | { type: 'itemFailed', itemId: string, reason: string }
    | { type: 'loginOk' }
    | { type: 'steamGuard', kind: GuardKind }
    | { type: 'finished', status: Exclude<JobStatus, 'queued' | 'running' | 'interrupted'>, error: string | null }

export interface LiveJob {
  id: string
  appId: number
  itemIds: string[]
  accountId: number | null
  status: JobStatus
  slot: number | null
  progress: Record<string, { bytes: number, total: number }>
  /** Sum of the items' Web API file sizes. */
  bytesTotal: number
  itemErrors: Record<string, string>
  /** Items that finished downloading. */
  itemsDone: Record<string, true>
  log: string[]
  error: string | null
  guard: GuardKind | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

const MAX_LOG_LINES = 2000
const LOG_TAIL_LINES = 200
const ACTIVE: JobStatus[] = ['queued', 'running']

const state = reactive({ jobs: [] as LiveJob[], loaded: false })
// Events of one job are handled strictly in order (snapshot writes must finish before "finished").
const chains = new Map<string, Promise<void>>()

export function useJobs() {
  const { db } = useDb()
  const { settings } = useSettings()
  const catalog = useCatalog()
  const library = useLibrary()
  const accounts = useAccounts()
  const toast = useToast()

  /** Marks jobs left running by a previous session as interrupted and loads recent history. */
  async function loadHistory() {
    if (state.loaded) return
    state.loaded = true
    await db().update(jobs).set({ status: 'interrupted', finishedAt: Date.now() }).where(inArray(jobs.status, ACTIVE))
    const rows = await db().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(50)
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

    await db().insert(jobs).values({
      id,
      appId,
      itemIds,
      accountId,
      status: 'queued',
      bytesTotal,
      createdAt
    })
    state.jobs.unshift({
      id, appId, itemIds, accountId, status: 'queued', slot: null, progress: {}, bytesTotal, itemErrors: {}, itemsDone: {},
      log: [], error: null, guard: null, createdAt, startedAt: null, finishedAt: null
    })
    const job = state.jobs[0]!

    const channel = new Channel<JobEvent>()
    channel.onmessage = (event) => {
      const next = (chains.get(id) ?? Promise.resolve())
        .then(() => handle(job, event))
        .catch((e) => {
          job.log.push(`[app] ${e instanceof Error ? e.message : String(e)}`)
        })
      chains.set(id, next)
    }

    try {
      await invoke('job_start', {
        request: {
          jobId: id,
          appId,
          items: items.map(i => ({ id: i.id, timeUpdated: i.remoteTimeUpdated, fileSize: i.fileSize })),
          libraryPath: settings.value.libraryPath,
          account: account?.username ?? null,
          guardCode: guardCode ?? null
        },
        onEvent: channel
      })
    } catch (e) {
      await handle(job, { type: 'finished', status: 'failed', error: e instanceof Error ? e.message : String(e) })
    }
    return id
  }

  async function handle(job: LiveJob, event: JobEvent) {
    switch (event.type) {
      case 'queued':
        job.status = 'queued'
        break
      case 'started':
        job.status = 'running'
        job.slot = event.slot
        job.startedAt = Date.now()
        await db().update(jobs).set({ status: 'running', workerSlot: event.slot, startedAt: job.startedAt }).where(eq(jobs.id, job.id))
        break
      case 'log':
        job.log.push(event.line)
        if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES)
        break
      case 'progress':
        job.progress[event.itemId] = { bytes: event.bytes, total: event.total }
        break
      case 'itemDone':
        job.progress[event.itemId] = { bytes: event.sizeBytes, total: event.sizeBytes }
        job.itemsDone[event.itemId] = true
        await onItemDone(job, event)
        break
      case 'itemFailed':
        job.itemErrors[event.itemId] = event.reason
        break
      case 'loginOk':
        if (job.accountId !== null) await accounts.markLoginOk(job.accountId)
        break
      case 'steamGuard':
        job.guard = event.kind
        break
      case 'finished':
        await onFinished(job, event)
        chains.delete(job.id)
        break
    }
  }

  async function onItemDone(job: LiveJob, event: Extract<JobEvent, { type: 'itemDone' }>) {
    const snapshot = await library.recordSnapshot(event)
    const item = await catalog.getItem(event.itemId)
    const app = await catalog.getApp(job.appId)
    if (!item || !app) return
    try {
      await library.detectVersions(snapshot, item, app)
    } catch (e) {
      job.log.push(`[app] version detection failed for ${item.id}: ${String(e)}`)
    }
    // A fresh download becomes the active version; older snapshots stay available to switch back.
    try {
      await library.activate(snapshot.id)
    } catch (e) {
      job.itemErrors[item.id] = `Downloaded, but linking failed: ${e instanceof Error ? e.message : String(e)}`
    }
    try {
      await library.prune(item.id)
    } catch (e) {
      job.log.push(`[app] cleanup of old snapshots failed for ${item.id}: ${String(e)}`)
    }
  }

  async function onFinished(job: LiveJob, event: Extract<JobEvent, { type: 'finished' }>) {
    job.status = event.status
    job.error = event.error
    job.finishedAt = Date.now()
    const bytesDone = Object.values(job.progress).reduce((sum, p) => sum + p.bytes, 0)
    await db().update(jobs).set({
      status: event.status,
      error: event.error ?? (Object.keys(job.itemErrors).length ? Object.entries(job.itemErrors).map(([id, r]) => `${id}: ${r}`).join('\n') : null),
      bytesDone,
      logTail: job.log.slice(-LOG_TAIL_LINES).join('\n'),
      finishedAt: job.finishedAt
    }).where(eq(jobs.id, job.id))

    if (event.status === 'needs_guard') {
      toast.add({ title: 'Steam Guard code needed', description: 'Enter the code on the Downloads page to continue.', color: 'warning' })
    } else if (event.status === 'failed') {
      toast.add({ title: 'Download failed', description: event.error ?? 'See the job log', color: 'error' })
    }
  }

  const cancel = (jobId: string) => invoke<boolean>('job_cancel', { jobId })

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
    if (finished.length) await db().delete(jobs).where(inArray(jobs.id, finished.map(j => j.id)))
    state.jobs.splice(0, state.jobs.length, ...state.jobs.filter(j => ACTIVE.includes(j.status)))
  }

  const active = computed(() => state.jobs.filter(j => ACTIVE.includes(j.status)))
  const busyItemIds = computed(() => new Set(active.value.flatMap(j => j.itemIds)))

  return { jobs: computed(() => state.jobs), active, busyItemIds, loadHistory, enqueue, cancel, submitGuardCode, retry, retryItem, clearFinished }
}

/**
 * Per-item results of a job loaded from history. A partial job stored its failures as
 * "<itemId>: <reason>" lines in `error`; the other items of a done/partial job finished.
 */
function historyItems(status: JobStatus, itemIds: string[], error: string | null) {
  const itemErrors: Record<string, string> = {}
  const itemsDone: Record<string, true> = {}
  if (status === 'partial') {
    for (const line of (error ?? '').split('\n')) {
      const m = line.match(/^(\d+): (.*)$/)
      if (m && itemIds.includes(m[1]!)) itemErrors[m[1]!] = m[2]!
    }
  }
  if (status === 'done' || status === 'partial') {
    for (const id of itemIds) if (!itemErrors[id]) itemsDone[id] = true
  }
  return { itemErrors, itemsDone }
}

export type ItemState = 'queued' | 'waiting' | 'downloading' | 'done' | 'failed' | 'cancelled' | 'needs_guard' | 'interrupted'

/** Where one item of a job stands, and why when it didn't finish. */
export function itemState(job: LiveJob, itemId: string): { state: ItemState, reason: string | null } {
  if (job.itemErrors[itemId]) return { state: 'failed', reason: job.itemErrors[itemId]! }
  if (job.itemsDone[itemId]) return { state: 'done', reason: null }
  switch (job.status) {
    case 'queued':
      return { state: 'queued', reason: null }
    case 'running':
      // SteamCMD fetches a process's items one after another.
      return { state: job.progress[itemId] ? 'downloading' : 'waiting', reason: null }
    case 'done':
      return { state: 'done', reason: null }
    case 'partial':
    case 'failed':
      return { state: 'failed', reason: job.error }
    default:
      return { state: job.status, reason: job.error }
  }
}

export function jobProgress(job: LiveJob) {
  const values = Object.values(job.progress)
  const bytes = values.reduce((s, p) => s + Math.min(p.bytes, p.total || p.bytes), 0)
  const total = Math.max(job.bytesTotal, values.reduce((s, p) => s + (p.total || p.bytes), 0))
  return { bytes, total, ratio: total ? Math.min(1, bytes / total) : 0 }
}
