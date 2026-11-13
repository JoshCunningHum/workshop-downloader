import { invoke } from '@tauri-apps/api/core'
import { expandTemplate } from '~/adapters/engine'
import type { AppRow } from '~/db/schema'
import type { ItemDetails } from './useSteamApi'

// Mirrors src-tauri/src/mods.rs FoundFolder.
interface FoundFolder {
  itemId: string
  path: string
  kind: 'folder' | 'library' | 'link'
  modified: number | null
}

export type ImportStatus
  = | 'ready' // can be imported
    | 'managed' // already a link into the library
    | 'link' // a link pointing elsewhere; left alone
    | 'notFound' // Steam doesn't know the id (or it's removed/private)
    | 'otherGame' // a workshop item of another app
    | 'exists' // that revision is already in the library

export interface ImportCandidate {
  itemId: string
  path: string
  status: ImportStatus
  reason: string | null
  details: ItemDetails | null
  /** Revision recorded for the snapshot: the folder's newest file time, capped at Steam's. */
  timeUpdated: number
}

const REASONS: Record<Exclude<ImportStatus, 'ready'>, string> = {
  managed: 'Already managed by this app',
  link: 'A link to a folder outside the library; left alone',
  notFound: 'Not found on the Steam Workshop (removed, private, or not a workshop item)',
  otherGame: 'A workshop item of a different game',
  exists: 'This revision is already in the library'
}

const sameFolder = (a: string, b: string) =>
  a.replace(/\\/g, '/').replace(/\/+$/, '') === b.replace(/\\/g, '/').replace(/\/+$/, '')

// Takes over a game's existing mods folder (`<mods>/<workshop item id>/`): the folder name is the
// item id, and Steam's Web API decides whether it's a workshop item of this game. Each one is
// then moved into the library as a snapshot with a link left in its place.
export function useModsImport() {
  const { settings } = useSettings()
  const catalog = useCatalog()
  const library = useLibrary()
  const adapters = useAdapters()
  const steam = useSteamApi()

  /** The app's mods folder with the template filled in, or null if it has none. */
  async function modsFolder(app: AppRow): Promise<string | null> {
    const adapter = await adapters.forApp(app)
    const template = app.modsPath || adapter.modsPath
    return template ? expandTemplate(template, { install: app.installPath, appId: app.appId }) : null
  }

  async function scan(app: AppRow): Promise<ImportCandidate[]> {
    const folder = await modsFolder(app)
    if (!folder) throw new Error('Set a mods folder first')
    const found = await invoke<FoundFolder[]>('mods_scan', { modsPath: folder, libraryPath: settings.value.libraryPath })

    const real = found.filter(f => f.kind === 'folder')
    const details = new Map((real.length ? await steam.itemDetails(real.map(f => f.itemId)) : []).map(d => [d.id, d]))
    const existing = new Map<string, Set<number>>()
    for (const f of real) existing.set(f.itemId, new Set((await library.listSnapshots(f.itemId)).map(s => s.timeUpdated)))

    const candidates: ImportCandidate[] = []
    for (const f of found) {
      const d = details.get(f.itemId) ?? null
      const timeUpdated = d ? Math.min(f.modified ?? d.timeUpdated, d.timeUpdated) : (f.modified ?? 0)
      const status = check(f, d, timeUpdated)
      candidates.push({ itemId: f.itemId, path: f.path, status, reason: status === 'ready' ? null : REASONS[status], details: d, timeUpdated })
    }
    return candidates

    function check(f: FoundFolder, d: ItemDetails | null, timeUpdated: number): ImportStatus {
      if (f.kind === 'library') return 'managed'
      if (f.kind === 'link') return 'link'
      if (!d || d.result !== 1) return 'notFound'
      if (d.appId !== app.appId) return 'otherGame'
      if (existing.get(f.itemId)?.has(timeUpdated)) return 'exists'
      return 'ready'
    }
  }

  /** Imports one candidate: moves its folder into the library, records it and makes it active. */
  async function importOne(app: AppRow, candidate: ImportCandidate) {
    if (candidate.status !== 'ready' || !candidate.details) throw new Error(`${candidate.itemId} can't be imported`)
    const libraryPath = library.libraryPath()
    await catalog.upsertItems([candidate.details])

    const path = await invoke<string>('mods_adopt', {
      source: candidate.path,
      libraryPath,
      appId: app.appId,
      itemId: candidate.itemId,
      timeUpdated: candidate.timeUpdated,
      mode: app.linkMode
    })
    const sizeBytes = await invoke<{ bytes: number }>('snapshot_size', { path }).then(t => t.bytes).catch(() => 0)
    const snapshot = await library.recordSnapshot({ itemId: candidate.itemId, timeUpdated: candidate.timeUpdated, path, sizeBytes })

    const item = await catalog.getItem(candidate.itemId)
    if (item) await library.detectVersions(snapshot, item, app).catch(() => [])

    // activate() records the link (re-creating it at the same spot). If the adapter names links
    // differently than the folder, drop the one left at the old folder name.
    await library.activate(snapshot.id)
    const linkPath = item ? await library.linkPathFor(app, item) : null
    if (linkPath && !sameFolder(linkPath, candidate.path)) {
      await invoke('link_remove', { linkPath: candidate.path, libraryPath })
    }
  }

  return { modsFolder, scan, importOne }
}
