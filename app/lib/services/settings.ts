import { command } from '~/lib/api/tauri'
import { db } from '~/lib/db/instance'
import { settings } from '~/lib/db/schema'

// Key/value app settings.

export const list = () => db().select().from(settings)

export async function save(key: string, value: unknown) {
  await db().insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
}

/** Resizes the SteamCMD worker pool. */
export const setJobConcurrency = (concurrency: number) => command('jobs_set_concurrency', { concurrency })
