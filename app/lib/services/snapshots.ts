import { and, desc, eq, inArray, sum } from 'drizzle-orm'
import { command } from '~/lib/api/tauri'
import { db } from '~/lib/db/instance'
import { snapshots, workshopItems, type SnapshotRow } from '~/lib/db/schema'

// Downloaded revisions of items: rows plus their folders in the library.

export const listForItem = (itemId: string) =>
  db().select().from(snapshots).where(eq(snapshots.itemId, itemId)).orderBy(desc(snapshots.timeUpdated))

export async function listForItems(itemIds: string[]) {
  if (!itemIds.length) return []
  return db().select().from(snapshots).where(inArray(snapshots.itemId, itemIds))
}

export async function byIds(ids: number[]) {
  if (!ids.length) return []
  return db().select().from(snapshots).where(inArray(snapshots.id, ids))
}

export async function get(id: number): Promise<SnapshotRow | null> {
  return (await db().select().from(snapshots).where(eq(snapshots.id, id)))[0] ?? null
}

/** Newest snapshot of an item. */
export async function latest(itemId: string): Promise<SnapshotRow | null> {
  return (await db().select().from(snapshots).where(eq(snapshots.itemId, itemId)).orderBy(desc(snapshots.timeUpdated)).limit(1))[0] ?? null
}

/** Latest downloaded revision per item. */
export async function latestTimes(itemIds: string[]): Promise<Map<string, number>> {
  const latest = new Map<string, number>()
  if (!itemIds.length) return latest
  const rows = await db().select({ itemId: snapshots.itemId, timeUpdated: snapshots.timeUpdated })
    .from(snapshots).where(inArray(snapshots.itemId, itemIds)).orderBy(desc(snapshots.timeUpdated))
  for (const row of rows) if (!latest.has(row.itemId)) latest.set(row.itemId, row.timeUpdated)
  return latest
}

/** Records a finished download (same revision downloaded again replaces the row). */
export async function record(input: { itemId: string, timeUpdated: number, path: string, sizeBytes: number }) {
  const values = { ...input, downloadedAt: Date.now() }
  await db().insert(snapshots).values(values)
    .onConflictDoUpdate({ target: [snapshots.itemId, snapshots.timeUpdated], set: { path: input.path, sizeBytes: input.sizeBytes, downloadedAt: values.downloadedAt } })
  return (await db().select().from(snapshots).where(eq(snapshots.itemId, input.itemId)))
    .find(s => s.timeUpdated === input.timeUpdated)!
}

export async function setPinned(id: number, pinned: boolean) {
  await db().update(snapshots).set({ pinned }).where(eq(snapshots.id, id))
}

export async function setItemVersions(id: number, itemVersions: string[]) {
  await db().update(snapshots).set({ itemVersions }).where(eq(snapshots.id, id))
}

/** Snapshot bytes on disk per app, and how much of that is the active revisions. */
export async function usageByApp(): Promise<Record<number, { active: number, total: number }>> {
  const [totals, actives] = await Promise.all([
    db().select({ appId: workshopItems.appId, bytes: sum(snapshots.sizeBytes) })
      .from(snapshots).innerJoin(workshopItems, eq(snapshots.itemId, workshopItems.id))
      .groupBy(workshopItems.appId),
    db().select({ appId: workshopItems.appId, bytes: sum(snapshots.sizeBytes) })
      .from(snapshots).innerJoin(workshopItems, and(eq(snapshots.itemId, workshopItems.id), eq(snapshots.id, workshopItems.activeSnapshotId)))
      .groupBy(workshopItems.appId)
  ])
  const active = new Map(actives.map(r => [r.appId, Number(r.bytes) || 0]))
  return Object.fromEntries(totals.map(r => [r.appId, { active: active.get(r.appId) ?? 0, total: Number(r.bytes) || 0 }]))
}

export async function removeRow(id: number) {
  await db().delete(snapshots).where(eq(snapshots.id, id))
}

/** Deletes a snapshot folder (must be inside the library). */
export const deleteFolder = (libraryPath: string, path: string) => command('snapshot_delete', { libraryPath, path })

/** Size of a folder on disk. */
export const folderSize = (path: string) => command<{ bytes: number, files: number }>('snapshot_size', { path })
