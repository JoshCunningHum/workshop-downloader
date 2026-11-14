import { expandTemplate } from '~/lib/adapters/engine'
import type { AppRow } from '~/lib/db/schema'
import * as links from '~/lib/services/links'
import * as mods from '~/lib/services/mods'
import * as snapshots from '~/lib/services/snapshots'
import * as steam from '~/lib/services/steam'
import { IMPORT_SKIP_REASONS } from '~/constants/mods-import'
import type { FoundFolder, ImportCandidate, ImportStatus } from '~/types/mods'
import type { ItemDetails } from '~/types/steam'

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

  /** The app's mods folder with the template filled in, or null if it has none. */
  async function modsFolder(app: AppRow): Promise<string | null> {
    const adapter = await adapters.forApp(app)
    const template = app.modsPath || adapter.modsPath
    return template ? expandTemplate(template, { install: app.installPath, appId: app.appId }) : null
  }

  async function scan(app: AppRow): Promise<ImportCandidate[]> {
    const folder = await modsFolder(app)
    if (!folder) throw new Error('Set a mods folder first')
    const found = await mods.scan(folder, settings.value.libraryPath)

    const real = found.filter(f => f.kind === 'folder')
    const details = new Map((real.length ? await steam.itemDetails(real.map(f => f.itemId)) : []).map(d => [d.id, d]))
    const existing = new Map<string, Set<number>>()
    for (const f of real) existing.set(f.itemId, new Set((await library.listSnapshots(f.itemId)).map(s => s.timeUpdated)))

    const candidates: ImportCandidate[] = []
    for (const f of found) {
      const d = details.get(f.itemId) ?? null
      const timeUpdated = d ? Math.min(f.modified ?? d.timeUpdated, d.timeUpdated) : (f.modified ?? 0)
      const status = check(f, d, timeUpdated)
      candidates.push({ itemId: f.itemId, path: f.path, status, reason: status === 'ready' ? null : IMPORT_SKIP_REASONS[status], details: d, timeUpdated })
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

    const path = await mods.adopt({
      source: candidate.path,
      libraryPath,
      appId: app.appId,
      itemId: candidate.itemId,
      timeUpdated: candidate.timeUpdated,
      mode: app.linkMode
    })
    const sizeBytes = await snapshots.folderSize(path).then(t => t.bytes).catch(() => 0)
    const snapshot = await library.recordSnapshot({ itemId: candidate.itemId, timeUpdated: candidate.timeUpdated, path, sizeBytes })

    const item = await catalog.getItem(candidate.itemId)
    if (item) await library.detectVersions(snapshot, item, app).catch(() => [])

    // activate() records the link (re-creating it at the same spot). If the adapter names links
    // differently than the folder, drop the one left at the old folder name.
    await library.activate(snapshot.id)
    const linkPath = item ? await library.linkPathFor(app, item) : null
    if (linkPath && !sameFolder(linkPath, candidate.path)) {
      await links.removeLink(candidate.path, libraryPath)
    }
  }

  return { modsFolder, scan, importOne }
}
