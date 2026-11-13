import { Channel, invoke } from '@tauri-apps/api/core'
import { count } from 'drizzle-orm'
import { steamApps } from '~/db/schema'

// Mirrors src-tauri/src/steamcmd/appinfo.rs AppEntry and job.rs AppIndexEvent.
export interface AppEntry { appId: number, name: string | null, kind: string | null }
export type AppIndexEvent
  = | { type: 'log', line: string }
    | { type: 'package', count: number }
    | { type: 'app', entry: AppEntry, done: number, total: number }

// SQLite allows 999 bound variables per statement; 4 columns per row.
const BATCH = 200

// The list of anonymously downloadable apps (Steam package 17906) the game selector searches.
export function useSteamAppIndex() {
  const { db } = useDb()

  const list = () => db().select().from(steamApps).orderBy(steamApps.name)

  async function size() {
    return (await db().select({ n: count() }).from(steamApps))[0]?.n ?? 0
  }

  /** Asks SteamCMD for the list and replaces the stored one. Takes a while: one app_info per app. */
  async function rebuild(onEvent?: (event: AppIndexEvent) => void) {
    const channel = new Channel<AppIndexEvent>()
    if (onEvent) channel.onmessage = onEvent
    const entries = await invoke<AppEntry[]>('steam_app_index', { onEvent: channel })

    const now = Date.now()
    await db().delete(steamApps)
    for (let i = 0; i < entries.length; i += BATCH) {
      await db().insert(steamApps).values(entries.slice(i, i + BATCH).map(e => ({
        appId: e.appId,
        name: e.name,
        type: e.kind,
        updatedAt: now
      })))
    }
    return entries.length
  }

  return { list, size, rebuild }
}
