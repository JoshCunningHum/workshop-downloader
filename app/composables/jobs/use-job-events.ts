import { LOG_TAIL_LINES, MAX_LOG_LINES } from '~/constants/jobs'
import * as accounts from '~/lib/services/accounts'
import * as jobsDb from '~/lib/services/jobs'
import type { JobEvent, LiveJob } from '~/types/jobs'

// Applies a SteamCMD job's events to its live state and the database: progress, finished items
// (snapshot, version detection, link, cleanup), Steam Guard prompts and the final status.
export function useJobEvents() {
  const catalog = useCatalog()
  const library = useLibrary()
  const toast = useToast()
  const speed = useItemSpeed()

  async function handle(job: LiveJob, event: JobEvent) {
    switch (event.type) {
      case 'queued':
        job.status = 'queued'
        break
      case 'started':
        job.status = 'running'
        job.slot = event.slot
        job.startedAt = Date.now()
        await jobsDb.update(job.id, { status: 'running', workerSlot: event.slot, startedAt: job.startedAt })
        break
      case 'log':
        job.log.push(event.line)
        if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES)
        break
      case 'progress':
        job.progress[event.itemId] = { bytes: event.bytes, total: event.total }
        speed.record(job.id, event.itemId, event.bytes, event.total)
        break
      case 'itemDone':
        job.progress[event.itemId] = { bytes: event.sizeBytes, total: event.sizeBytes }
        job.itemsDone[event.itemId] = true
        speed.stop(job.id, event.itemId)
        await onItemDone(job, event)
        break
      case 'itemFailed':
        job.itemErrors[event.itemId] = event.reason
        speed.stop(job.id, event.itemId)
        break
      case 'loginOk':
        if (job.accountId !== null) await accounts.markLoginOk(job.accountId)
        break
      case 'steamGuard':
        job.guard = event.kind
        break
      case 'finished':
        await onFinished(job, event)
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
    // Locked items keep their version: the new revision is only kept.
    if (item.held) {
      job.log.push(`[app] ${item.id} is locked; new revision kept but not activated`)
    } else {
      try {
        await library.activate(snapshot.id, { reason: 'download' })
      } catch (e) {
        job.itemErrors[item.id] = `Downloaded, but linking failed: ${e instanceof Error ? e.message : String(e)}`
      }
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
    for (const itemId of job.itemIds) speed.stop(job.id, itemId)
    const bytesDone = Object.values(job.progress).reduce((sum, p) => sum + p.bytes, 0)
    await jobsDb.update(job.id, {
      status: event.status,
      error: event.error ?? (Object.keys(job.itemErrors).length ? Object.entries(job.itemErrors).map(([id, r]) => `${id}: ${r}`).join('\n') : null),
      bytesDone,
      logTail: job.log.slice(-LOG_TAIL_LINES).join('\n'),
      finishedAt: job.finishedAt
    })

    if (event.status === 'needs_guard') {
      toast.add({ title: 'Steam Guard code needed', description: 'Enter the code on the Downloads page to continue.', color: 'warning' })
    } else if (event.status === 'failed') {
      toast.add({ title: 'Download failed', description: event.error ?? 'See the job log', color: 'error' })
    }
  }

  return { handle }
}
