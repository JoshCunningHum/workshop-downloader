import type { JobStatus } from '~/lib/db/schema'

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

/** A job as the Downloads page shows it: persisted fields plus live progress. */
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

/** Where one item of a job stands. */
export type ItemState = 'queued' | 'waiting' | 'downloading' | 'done' | 'failed' | 'cancelled' | 'needs_guard' | 'interrupted'
