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
  /** Workshop page text (BBCode). */
  description: string
  subscriptions: number
  favorited: number
  views: number
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
