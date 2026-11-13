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

// Mirrors steam_api.rs AppDetails (store.steampowered.com/api/appdetails).
export interface AppDetails {
  name: string
  kind: string | null
  shortDescription: string | null
  headerImage: string | null
  capsuleImage: string | null
  developers: string[]
  publishers: string[]
  genres: string[]
  releaseDate: string | null
  website: string | null
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
    appDetails: (appId: number) => invoke<AppDetails | null>('steam_app_details', { appId }),
    installedGames: () => invoke<InstalledGame[]>('steam_installed_games'),
    installedGame: (appId: number) => invoke<InstalledGame | null>('steam_installed_game', { appId })
  }
}
