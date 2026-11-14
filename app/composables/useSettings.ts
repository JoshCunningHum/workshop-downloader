import { invoke } from '@tauri-apps/api/core'
import { settings as settingsTable } from '~/lib/db/schema'
import { DEFAULT_SETTINGS } from '~/constants/settings'
import type { AppSettings } from '~/types/settings'

export function useSettings() {
  const settings = useState<AppSettings>('settings', () => ({ ...DEFAULT_SETTINGS }))
  const { db } = useDb()

  async function load() {
    const rows = await db().select().from(settingsTable)
    const loaded = { ...DEFAULT_SETTINGS }
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
