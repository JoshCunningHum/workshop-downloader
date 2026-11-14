import { isTauri } from '@tauri-apps/api/core'
import { openDb } from '~/lib/db/client'
import { migrate } from '~/lib/db/migrate'

// Opens the SQLite database and applies pending migrations before the app renders.
export default defineNuxtPlugin(async () => {
  const ready = useState('db:ready', () => false)
  const error = useState<string | null>('db:error', () => null)

  if (!isTauri()) {
    error.value = 'Not running inside Tauri (start the app with `bun tauri dev`).'
    return
  }

  try {
    const { sqlite, db } = await openDb()
    await migrate(sqlite)
    setDb(db)
    await useAdapters().seedBuiltins()
    await useSettings().load()
    await useJobs().loadHistory()
    ready.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})
