import { channel, command } from '~/lib/api/tauri'
import type { AppEntry, AppIndexEvent, SteamCmdStatus } from '~/types/steamcmd'

// The SteamCMD install, and asking it for the anonymous app list.

export const status = () => command<SteamCmdStatus>('steamcmd_status')

/** Installs SteamCMD (or wipes and reinstalls it); output lines go to `onLog`. */
export const install = (reinstall: boolean, onLog: (line: string) => void) =>
  command('steamcmd_install', { reinstall, onLog: channel(onLog) })

/** Apps in Steam's anonymous dedicated-server package, with names. Takes a while. */
export const appIndex = (onEvent?: (event: AppIndexEvent) => void) =>
  command<AppEntry[]>('steam_app_index', { onEvent: channel(onEvent) })
