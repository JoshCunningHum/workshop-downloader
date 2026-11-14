import { eq } from 'drizzle-orm'
import { command } from '~/lib/api/tauri'
import { builtinAdapters } from '~/lib/adapters/builtin'
import { db } from '~/lib/db/instance'
import { adapters } from '~/lib/db/schema'
import type { AdapterDefinition, FileContent } from '~/types/adapters'
import * as apps from './apps'

// Adapter definitions (rows) and the file reader their rules use.

/** Writes the built-in adapters, replacing older copies. */
export async function seedBuiltins() {
  for (const definition of builtinAdapters) {
    await db().insert(adapters)
      .values({ id: definition.id, name: definition.name, appId: definition.appId, builtin: true, definition })
      .onConflictDoUpdate({ target: adapters.id, set: { name: definition.name, appId: definition.appId, builtin: true, definition } })
  }
}

export const list = () => db().select().from(adapters).orderBy(adapters.name)

export async function get(id: string) {
  return (await db().select().from(adapters).where(eq(adapters.id, id)))[0] ?? null
}

export async function save(definition: AdapterDefinition) {
  const existing = await get(definition.id)
  if (existing?.builtin) throw new Error('Built-in adapters are read-only; duplicate it under a new id instead')
  await db().insert(adapters)
    .values({ id: definition.id, name: definition.name, appId: definition.appId, builtin: false, definition })
    .onConflictDoUpdate({ target: adapters.id, set: { name: definition.name, appId: definition.appId, definition } })
}

export async function remove(id: string) {
  const existing = await get(id)
  if (existing?.builtin) throw new Error('Built-in adapters cannot be deleted')
  await apps.clearAdapter(id)
  await db().delete(adapters).where(eq(adapters.id, id))
}

/** Reads small text files under `root` for adapter rules (bounded in count and size). */
export const readFiles = (root: string, globs: string[]) =>
  command<FileContent[]>('read_files', { root, globs, maxBytes: 256 * 1024 })
