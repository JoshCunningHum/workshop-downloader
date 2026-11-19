import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/lib/db/instance'
import { restorePoints, type RestorePointRow } from '~/lib/db/schema'

// Restore points saved on purpose (the restore_points table).

/** A game's saved points, newest first. */
export const forApp = (appId: number) =>
  db().select().from(restorePoints).where(eq(restorePoints.appId, appId)).orderBy(desc(restorePoints.createdAt))

export async function create(input: { appId: number, label: string | null, state: Record<string, number | null> }): Promise<RestorePointRow> {
  const values = { ...input, createdAt: Date.now() }
  await db().insert(restorePoints).values(values)
  return (await db().select().from(restorePoints)
    .where(and(eq(restorePoints.appId, input.appId), eq(restorePoints.createdAt, values.createdAt))))[0]!
}

export async function remove(id: number) {
  await db().delete(restorePoints).where(eq(restorePoints.id, id))
}

/** Snapshots some saved point of the game links; cleanup keeps them. */
export async function protectedSnapshotIds(appId: number): Promise<Set<number>> {
  const ids = new Set<number>()
  for (const point of await forApp(appId)) {
    for (const id of Object.values(point.state)) if (id !== null) ids.add(id)
  }
  return ids
}
