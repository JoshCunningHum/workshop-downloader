import { builtinAdapters } from '~/lib/adapters/builtin'
import { detectGameVersion, detectItemVersions } from '~/lib/adapters/engine'
import type { AdapterRow, AppRow, ItemRow } from '~/lib/db/schema'
import * as adapters from '~/lib/services/adapters'
import * as items from '~/lib/services/items'
import * as snapshots from '~/lib/services/snapshots'
import * as steam from '~/lib/services/steam'
import type { AdapterDefinition, ExtractContext } from '~/types/adapters'

// Adapters: picking the one for a game, and running its version rules.
export function useAdapters() {
  /** The app's chosen adapter, else one written for its AppID, else the generic one. */
  async function forApp(app: Pick<AppRow, 'appId' | 'adapterId'>): Promise<AdapterDefinition> {
    const all = await adapters.list()
    const chosen = all.find(a => a.id === app.adapterId)
      ?? all.find(a => a.appId === app.appId)
      ?? all.find(a => a.id === 'generic')
    return chosen?.definition ?? builtinAdapters[0]!
  }

  async function gameVersion(app: AppRow, adapter?: AdapterDefinition) {
    adapter ??= await forApp(app)
    const installed = await steam.installedGame(app.appId).catch(() => null)
    const ctx: ExtractContext = { tags: [], installPath: app.installPath, buildId: installed?.buildId, readFiles: adapters.readFiles }
    return detectGameVersion(adapter, ctx)
  }

  async function itemVersions(item: Pick<ItemRow, 'tags'>, snapshotPath: string | null, adapter: AdapterDefinition) {
    return detectItemVersions(adapter, { tags: item.tags, itemRoot: snapshotPath, readFiles: adapters.readFiles })
  }

  /**
   * Tries every adapter that fits the app (generic ones and those written for its AppID) on its
   * workshop items: tags fresh from the Steam Web API, plus each item's newest snapshot for file
   * rules. The adapter that finds supported versions for the most items wins; on a tie, one written
   * for this AppID wins. Null when none finds anything (or the app has no items).
   */
  async function detectBest(app: Pick<AppRow, 'appId'>): Promise<{ adapter: AdapterRow, matched: number, total: number } | null> {
    const rows = await items.listForApp(app.appId)
    if (!rows.length) return null
    const candidates = (await adapters.list()).filter(a => a.appId === null || a.appId === app.appId)

    const details = await steam.itemDetails(rows.map(r => r.id)).catch(() => [])
    const tags = new Map(details.filter(d => d.result === 1).map(d => [d.id, d.tags]))
    const roots = new Map(await Promise.all(rows.map(async r => [r.id, (await snapshots.latest(r.id))?.path ?? null] as const)))

    const scored: { adapter: AdapterRow, matched: number }[] = []
    for (const adapter of candidates) {
      let matched = 0
      for (const row of rows) {
        const ctx = { tags: tags.get(row.id) ?? row.tags, itemRoot: roots.get(row.id) ?? null, readFiles: adapters.readFiles }
        if ((await detectItemVersions(adapter.definition, ctx)).length) matched++
      }
      scored.push({ adapter, matched })
    }
    const forThisApp = (a: AdapterRow) => Number(a.appId === app.appId)
    scored.sort((a, b) => b.matched - a.matched || forThisApp(b.adapter) - forThisApp(a.adapter))
    const best = scored[0]
    return best?.matched ? { ...best, total: rows.length } : null
  }

  return {
    seedBuiltins: adapters.seedBuiltins,
    list: adapters.list,
    get: adapters.get,
    save: adapters.save,
    remove: adapters.remove,
    forApp,
    gameVersion,
    itemVersions,
    detectBest
  }
}
