import * as settingsDb from '~/lib/services/settings'
import { DEFAULT_SETTINGS } from '~/constants/settings'
import type { AppSettings } from '~/types/settings'

export function useSettings() {
  const settings = useState<AppSettings>('settings', () => ({ ...DEFAULT_SETTINGS }))

  async function load() {
    const rows = await settingsDb.list()
    const loaded = { ...DEFAULT_SETTINGS }
    for (const row of rows) {
      if (row.key in loaded) (loaded as Record<string, unknown>)[row.key] = row.value
    }
    settings.value = loaded
    await settingsDb.setJobConcurrency(loaded.concurrency)
  }

  async function save<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    await settingsDb.save(key, value)
    settings.value = { ...settings.value, [key]: value }
    if (key === 'concurrency') await settingsDb.setJobConcurrency(value as number)
  }

  return { settings, load, save }
}
