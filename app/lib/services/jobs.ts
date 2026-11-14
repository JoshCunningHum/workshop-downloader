import type { Channel } from '@tauri-apps/api/core'
import { desc, eq, inArray } from 'drizzle-orm'
import { command } from '~/lib/api/tauri'
import { db } from '~/lib/db/instance'
import { jobs, type JobRow, type JobStatus } from '~/lib/db/schema'
import type { JobEvent } from '~/types/jobs'

// SteamCMD download jobs: rows plus the start/cancel commands.

/** Marks jobs with the given statuses as interrupted (left over from a previous session). */
export async function interrupt(statuses: JobStatus[]) {
  await db().update(jobs).set({ status: 'interrupted', finishedAt: Date.now() }).where(inArray(jobs.status, statuses))
}

export const recent = (limit: number) => db().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit)

export async function insert(values: Pick<JobRow, 'id' | 'appId' | 'itemIds' | 'accountId' | 'status' | 'bytesTotal' | 'createdAt'>) {
  await db().insert(jobs).values(values)
}

export async function update(id: string, patch: Partial<Omit<JobRow, 'id'>>) {
  await db().update(jobs).set(patch).where(eq(jobs.id, id))
}

export async function removeMany(ids: string[]) {
  if (ids.length) await db().delete(jobs).where(inArray(jobs.id, ids))
}

export interface StartRequest {
  jobId: string
  appId: number
  items: { id: string, timeUpdated: number, fileSize: number }[]
  libraryPath: string | null
  account: string | null
  guardCode: string | null
}

/** Starts a SteamCMD job; its events arrive on `onEvent`. */
export const start = (request: StartRequest, onEvent: Channel<JobEvent>) => command('job_start', { request, onEvent })

export const cancel = (jobId: string) => command<boolean>('job_cancel', { jobId })
