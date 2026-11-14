import { invoke } from '@tauri-apps/api/core'
import type { AppDetails, InstalledGame, ItemDetails, Resolved } from '~/types/steam'

export function useSteamApi() {
  return {
    resolve: (ids: string[]) => invoke<Resolved>('steam_resolve', { ids }),
    itemDetails: (ids: string[]) => invoke<ItemDetails[]>('steam_item_details', { ids }),
    appNames: (appIds: number[]) => invoke<Record<string, string>>('steam_app_names', { appIds }),
    appDetails: (appId: number) => invoke<AppDetails | null>('steam_app_details', { appId }),
    installedGames: () => invoke<InstalledGame[]>('steam_installed_games'),
    installedGame: (appId: number) => invoke<InstalledGame | null>('steam_installed_game', { appId })
  }
}
