import { and, eq, inArray } from 'drizzle-orm'
import { db } from '~/lib/db/instance'
import { workshopItems, type ItemRow } from '~/lib/db/schema'
import type { ItemDetails } from '~/types/steam'

// Workshop items (the workshop_items table).

/** Creates or refreshes items from Web API details. */
export async function upsert(details: ItemDetails[]) {
  for (const d of details) {
    const values = {
      appId: d.appId,
      title: d.title,
      author: d.creator,
      previewUrl: d.previewUrl,
      tags: d.tags,
      remoteTimeUpdated: d.timeUpdated,
      fileSize: d.fileSize
    }
    await db().insert(workshopItems)
      .values({ id: d.id, addedAt: Date.now(), ...values })
      .onConflictDoUpdate({ target: workshopItems.id, set: values })
  }
}

export const listAll = () => db().select().from(workshopItems)

export const listForApp = (appId: number) =>
  db().select().from(workshopItems).where(eq(workshopItems.appId, appId)).orderBy(workshopItems.title)

/** id, title and app of every item, for pickers. */
export const listBrief = () =>
  db().select({ id: workshopItems.id, title: workshopItems.title, appId: workshopItems.appId }).from(workshopItems).orderBy(workshopItems.title)

export async function get(id: string): Promise<ItemRow | null> {
  return (await db().select().from(workshopItems).where(eq(workshopItems.id, id)))[0] ?? null
}

export async function update(id: string, patch: Partial<Omit<ItemRow, 'id'>>) {
  await db().update(workshopItems).set(patch).where(eq(workshopItems.id, id))
}

export async function remove(id: string) {
  await db().delete(workshopItems).where(eq(workshopItems.id, id))
}

export async function byIds(ids: string[]) {
  if (!ids.length) return []
  return db().select().from(workshopItems).where(inArray(workshopItems.id, ids))
}

export const forApp = (appId: number, ids: string[]) =>
  db().select().from(workshopItems).where(and(eq(workshopItems.appId, appId), inArray(workshopItems.id, ids)))
