import { invoke } from '@tauri-apps/api/core'
import { settings as settingsTable } from '~/db/schema'

export interface AppSettings {
  /** Steam install folder; detected or picked during setup. */
  steamPath: string | null
  /** Where snapshots live. Must be on the same drive as the game for junctions to work well. */
  libraryPath: string | null
  /** Parallel SteamCMD workers. */
  concurrency: number
  /** Items per SteamCMD process; smaller batches spread better across workers. */
  batchSize: number
  /** Periodic update check (only when enabled). */
  updateCheckEnabled: boolean
  updateCheckMinutes: number
}

export const defaultSettings: AppSettings = {
  steamPath: null,
  libraryPath: null,
  concurrency: 3,
  batchSize: 10,
  updateCheckEnabled: false,
  updateCheckMinutes: 60
}

export function useSettings() {
  const settings = useState<AppSettings>('settings', () => ({ ...defaultSettings }))
  const { db } = useDb()

  async function load() {
    const rows = await db().select().from(settingsTable)
    const loaded = { ...defaultSettings }
    for (const row of rows) {
      if (row.key in loaded) (loaded as Record<string, unknown>)[row.key] = row.value
    }
    settings.value = loaded
    await invoke('jobs_set_concurrency', { concurrency: loaded.concurrency })
  }

  async function save<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await db().insert(settingsTable).values({ key, value }).onConflictDoUpdate({ target: settingsTable.key, set: { value } })
    settings.value = { ...settings.value, [key]: value }
    if (key === 'concurrency') await invoke('jobs_set_concurrency', { concurrency: value })
  }

  return { settings, load, save }
}
