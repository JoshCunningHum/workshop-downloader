import type { StepperItem } from '@nuxt/ui'

// Numeric values double as UStepper indexes.
export const SetupStatus = {
  Idle: -1,
  Steam: 0,
  Library: 1,
  SteamCmd: 2,
  AppList: 3,
  Finished: 4
} as const
export type SetupStatus = typeof SetupStatus[keyof typeof SetupStatus]

export const SETUP_STEPS: StepperItem[] = [
  { value: SetupStatus.Steam, title: 'Steam', icon: 'i-simple-icons-steam', description: 'Find the Steam install and its games' },
  { value: SetupStatus.Library, title: 'Library', icon: 'i-lucide-folder-down', description: 'Choose where snapshots are stored' },
  { value: SetupStatus.SteamCmd, title: 'SteamCMD', icon: 'i-lucide-terminal', description: 'Install the workshop downloader' },
  { value: SetupStatus.AppList, title: 'App list', icon: 'i-lucide-hash', description: 'Get the anonymously downloadable apps' }
]
