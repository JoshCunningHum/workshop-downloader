import type { AppSettings } from '~/types/settings'

export const DEFAULT_SETTINGS: AppSettings = {
  steamPath: null,
  libraryPath: null,
  concurrency: 3,
  batchSize: 10,
  updateCheckEnabled: false,
  updateCheckMinutes: 60
}
