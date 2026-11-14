import { command } from '~/lib/api/tauri'
import type { AppDetails, InstalledGame, ItemDetails, Resolved } from '~/types/steam'

// Steam Web API (via Rust, to avoid CORS) and the local Steam install.

/** Expands collections and fetches details for workshop ids. */
export const resolve = (ids: string[]) => command<Resolved>('steam_resolve', { ids })

export const itemDetails = (ids: string[]) => command<ItemDetails[]>('steam_item_details', { ids })

/** Names for app ids; unknown ids are left out. */
export const appNames = (appIds: number[]) => command<Record<string, string>>('steam_app_names', { appIds })

/** Store page metadata; null when the store has no page for the app. */
export const appDetails = (appId: number) => command<AppDetails | null>('steam_app_details', { appId })

export const installedGames = () => command<InstalledGame[]>('steam_installed_games')

export const installedGame = (appId: number) => command<InstalledGame | null>('steam_installed_game', { appId })

/** The detected Steam folder, or null. */
export const rootPath = () => command<string | null>('steam_root_path')
