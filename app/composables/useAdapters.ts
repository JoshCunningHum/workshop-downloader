import { invoke } from '@tauri-apps/api/core'
import { eq } from 'drizzle-orm'
import { builtinAdapters } from '~/adapters/builtin'
import { detectGameVersion, detectItemVersions } from '~/adapters/engine'
import type { AdapterDefinition, ExtractContext, FileContent } from '~/adapters/types'
import { adapters, apps, type AppRow, type ItemRow } from '~/db/schema'

const readFiles = (root: string, globs: string[]) =>
  invoke<FileContent[]>('read_files', { root, globs, maxBytes: 256 * 1024 })

export function useAdapters() {
  const { db } = useDb()

  async function seedBuiltins() {
    for (const definition of builtinAdapters) {
      await db().insert(adapters)
        .values({ id: definition.id, name: definition.name, appId: definition.appId, builtin: true, definition })
        .onConflictDoUpdate({ target: adapters.id, set: { name: definition.name, appId: definition.appId, builtin: true, definition } })
    }
  }

  const list = () => db().select().from(adapters).orderBy(adapters.name)

  async function get(id: string) {
    return (await db().select().from(adapters).where(eq(adapters.id, id)))[0] ?? null
  }

  async function save(definition: AdapterDefinition) {
    const existing = await get(definition.id)
    if (existing?.builtin) throw new Error('Built-in adapters are read-only; duplicate it under a new id instead')
    await db().insert(adapters)
      .values({ id: definition.id, name: definition.name, appId: definition.appId, builtin: false, definition })
      .onConflictDoUpdate({ target: adapters.id, set: { name: definition.name, appId: definition.appId, definition } })
  }

  async function remove(id: string) {
    const existing = await get(id)
    if (existing?.builtin) throw new Error('Built-in adapters cannot be deleted')
    await db().update(apps).set({ adapterId: null }).where(eq(apps.adapterId, id))
    await db().delete(adapters).where(eq(adapters.id, id))
  }

  /** The app's chosen adapter, else one written for its AppID, else the generic one. */
  async function forApp(app: Pick<AppRow, 'appId' | 'adapterId'>): Promise<AdapterDefinition> {
    const all = await list()
    const chosen = all.find(a => a.id === app.adapterId)
      ?? all.find(a => a.appId === app.appId)
      ?? all.find(a => a.id === 'generic')
    return chosen?.definition ?? builtinAdapters[0]!
  }

  async function gameVersion(app: AppRow, adapter?: AdapterDefinition) {
    adapter ??= await forApp(app)
    const installed = await useSteamApi().installedGame(app.appId).catch(() => null)
    const ctx: ExtractContext = { tags: [], installPath: app.installPath, buildId: installed?.buildId, readFiles }
    return detectGameVersion(adapter, ctx)
  }

  async function itemVersions(item: Pick<ItemRow, 'tags'>, snapshotPath: string | null, adapter: AdapterDefinition) {
    return detectItemVersions(adapter, { tags: item.tags, itemRoot: snapshotPath, readFiles })
  }

  return { seedBuiltins, list, get, save, remove, forApp, gameVersion, itemVersions }
}
