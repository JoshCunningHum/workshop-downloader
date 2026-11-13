import { invoke } from '@tauri-apps/api/core'

// Shapes returned by src-tauri/src/steam_api.rs and steam_local.rs.
export interface ItemDetails {
  id: string
  /** EResult; 1 = OK. */
  result: number
  appId: number
  title: string
  creator: string
  previewUrl: string | null
  fileSize: number
  timeCreated: number
  timeUpdated: number
  tags: string[]
  banned: boolean
}

export interface Resolved {
  items: ItemDetails[]
  collections: { id: string, children: string[] }[]
}

export interface InstalledGame {
  appId: number
  name: string
  installPath: string
  buildId: string | null
}

export function useSteamApi() {
  return {
    resolve: (ids: string[]) => invoke<Resolved>('steam_resolve', { ids }),
    itemDetails: (ids: string[]) => invoke<ItemDetails[]>('steam_item_details', { ids }),
    appNames: (appIds: number[]) => invoke<Record<string, string>>('steam_app_names', { appIds }),
    installedGames: () => invoke<InstalledGame[]>('steam_installed_games'),
    installedGame: (appId: number) => invoke<InstalledGame | null>('steam_installed_game', { appId })
  }
}
