import { invoke } from '@tauri-apps/api/core'
import type { StepperItem } from '@nuxt/ui'

export interface SteamCmdStatus { installed: boolean, root: string, concurrency: number }

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

// First-run onboarding: the app stays on /setup until a Steam folder, a library folder,
// SteamCMD and the app list (for the game selector) are all present. See middleware/ensure-setup.global.ts.
export function useSetup() {
  const status = useState<SetupStatus>('setup:status', () => SetupStatus.Idle)
  // Once everything is in place it stays that way for the session; skips re-checking on every navigation.
  const initialized = useState('setup:initialized', () => false)
  const { settings } = useSettings()

  /** First step that still needs doing, or Finished. */
  async function firstIncomplete(): Promise<SetupStatus> {
    if (!settings.value.steamPath) return SetupStatus.Steam
    if (!settings.value.libraryPath) return SetupStatus.Library
    const steamcmd = await invoke<SteamCmdStatus>('steamcmd_status')
    if (!steamcmd.installed) return SetupStatus.SteamCmd
    if (!await useSteamAppIndex().size()) return SetupStatus.AppList
    return SetupStatus.Finished
  }

  async function isInitialized() {
    if (!initialized.value) initialized.value = await firstIncomplete() === SetupStatus.Finished
    return initialized.value
  }

  /** Moves to the next step that isn't done yet; leaves setup when none is left. */
  async function next() {
    status.value = await firstIncomplete()
    if (status.value === SetupStatus.Finished) {
      initialized.value = true
      await navigateTo('/')
    }
  }

  return { status, isInitialized, next }
}
