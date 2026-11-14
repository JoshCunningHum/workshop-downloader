import { count, eq } from 'drizzle-orm'
import { db } from '~/lib/db/instance'
import { apps, workshopItems, type AppRow } from '~/lib/db/schema'

// Games (the apps table).

export const list = () => db().select().from(apps).orderBy(apps.name)

export async function get(appId: number): Promise<AppRow | null> {
  return (await db().select().from(apps).where(eq(apps.appId, appId)))[0] ?? null
}

export async function update(appId: number, patch: Partial<Omit<AppRow, 'appId'>>) {
  await db().update(apps).set(patch).where(eq(apps.appId, appId))
}

/** Inserts an app row unless one exists. */
export async function insertIfMissing(values: { appId: number, name: string | null, installPath: string | null }) {
  await db().insert(apps).values({ ...values, createdAt: Date.now() }).onConflictDoNothing()
}

/** Number of workshop items per app. */
export async function itemCounts(): Promise<Record<number, number>> {
  const rows = await db().select({ appId: workshopItems.appId, n: count() }).from(workshopItems).groupBy(workshopItems.appId)
  return Object.fromEntries(rows.map(r => [r.appId, r.n]))
}

/** Drops an account from the apps that use it. */
export async function clearAccount(accountId: number) {
  await db().update(apps).set({ accountId: null }).where(eq(apps.accountId, accountId))
}

/** Drops an adapter from the apps that use it. */
export async function clearAdapter(adapterId: string) {
  await db().update(apps).set({ adapterId: null }).where(eq(apps.adapterId, adapterId))
}
