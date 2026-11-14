import { SetupStatus } from '~/constants/setup'
import * as appIndex from '~/lib/services/app-index'
import * as steamcmd from '~/lib/services/steamcmd'

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
    if (!(await steamcmd.status()).installed) return SetupStatus.SteamCmd
    if (!await appIndex.size()) return SetupStatus.AppList
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
