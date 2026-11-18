import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db } from '~/lib/db/instance'
import { snapshotEvents, type SnapshotEventKind } from '~/lib/db/schema'

// History of which snapshot each item had linked (the snapshot_events table).

export async function record(input: { appId: number, itemId: string, kind: SnapshotEventKind, fromSnapshotId: number | null, toSnapshotId: number | null }) {
  await db().insert(snapshotEvents).values({ ...input, at: Date.now() })
}

/** A game's events, oldest first. */
export const forApp = (appId: number) =>
  db().select().from(snapshotEvents).where(eq(snapshotEvents.appId, appId)).orderBy(asc(snapshotEvents.at), asc(snapshotEvents.id))

/** A game's events between two times (ms, inclusive), oldest first. */
export const forAppBetween = (appId: number, from: number, to: number) =>
  db().select().from(snapshotEvents)
    .where(and(eq(snapshotEvents.appId, appId), gte(snapshotEvents.at, from), lte(snapshotEvents.at, to)))
    .orderBy(asc(snapshotEvents.at), asc(snapshotEvents.id))
