import type { JobStatus } from '~/lib/db/schema'
import type { ItemState, LiveJob } from '~/types/jobs'

/**
 * Per-item results of a job loaded from history. A partial job stored its failures as
 * "<itemId>: <reason>" lines in `error`; the other items of a done/partial job finished.
 */
export function historyItems(status: JobStatus, itemIds: string[], error: string | null) {
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

/** Bytes downloaded across a job's items. */
export function jobProgress(job: LiveJob) {
  const values = Object.values(job.progress)
  const bytes = values.reduce((s, p) => s + Math.min(p.bytes, p.total || p.bytes), 0)
  const total = Math.max(job.bytesTotal, values.reduce((s, p) => s + (p.total || p.bytes), 0))
  return { bytes, total, ratio: total ? Math.min(1, bytes / total) : 0 }
}
