import { command } from '~/lib/api/tauri'
import type { LinkMode } from '~/lib/db/schema'
import type { FoundFolder } from '~/types/mods'

// A game's existing mods folder (`<mods>/<workshop item id>/`).

/** Folders named like workshop item ids, and whether each is a real folder or a link. */
export const scan = (modsPath: string, libraryPath: string | null) =>
  command<FoundFolder[]>('mods_scan', { modsPath, libraryPath })

/** Moves a real item folder into the library as a snapshot and links it back; returns the snapshot path. */
export const adopt = (args: { source: string, libraryPath: string, appId: number, itemId: string, timeUpdated: number, mode: LinkMode }) =>
  command<string>('mods_adopt', args)
