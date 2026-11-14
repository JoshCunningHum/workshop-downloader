import { builtinAdapters } from '~/lib/adapters/builtin'
import { detectGameVersion, detectItemVersions } from '~/lib/adapters/engine'
import type { AppRow, ItemRow } from '~/lib/db/schema'
import * as adapters from '~/lib/services/adapters'
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

  return {
    seedBuiltins: adapters.seedBuiltins,
    list: adapters.list,
    get: adapters.get,
    save: adapters.save,
    remove: adapters.remove,
    forApp,
    gameVersion,
    itemVersions
  }
}
