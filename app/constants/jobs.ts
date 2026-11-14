import type { JobStatus } from '~/lib/db/schema'

/** Log lines kept in memory per job. */
export const MAX_LOG_LINES = 2000
/** Log lines saved with a finished job. */
export const LOG_TAIL_LINES = 200
/** Jobs that haven't finished yet. */
export const ACTIVE_JOB_STATUSES: JobStatus[] = ['queued', 'running']
/** Finished jobs loaded on start. */
export const HISTORY_LIMIT = 50
