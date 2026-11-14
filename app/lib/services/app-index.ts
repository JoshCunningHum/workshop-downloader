import { count } from 'drizzle-orm'
import { APP_INDEX_BATCH } from '~/constants/apps'
import { db } from '~/lib/db/instance'
import { steamApps } from '~/lib/db/schema'
import type { AppIndexEvent } from '~/types/steamcmd'
import * as steamcmd from './steamcmd'

// The list of anonymously downloadable apps (Steam package 17906) the game selector searches.

export const list = () => db().select().from(steamApps).orderBy(steamApps.name)

export async function size() {
  return (await db().select({ n: count() }).from(steamApps))[0]?.n ?? 0
}

/** Asks SteamCMD for the list and replaces the stored one. Takes a while: one app_info per app. */
export async function rebuild(onEvent?: (event: AppIndexEvent) => void) {
  const entries = await steamcmd.appIndex(onEvent)
  const now = Date.now()
  await db().delete(steamApps)
  for (let i = 0; i < entries.length; i += APP_INDEX_BATCH) {
    await db().insert(steamApps).values(entries.slice(i, i + APP_INDEX_BATCH).map(e => ({
      appId: e.appId,
      name: e.name,
      type: e.kind,
      updatedAt: now
    })))
  }
  return entries.length
}
