import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { apps, snapshots, workshopItems, type AppRow, type ItemRow } from '~/lib/db/schema'
import { STORE_MAX_AGE_MS } from '~/constants/apps'
import type { InstalledGame, ItemDetails } from '~/types/steam'

// Apps (games) and workshop items: creating them from Web API details, and update checks.
export function useCatalog() {
  const { db } = useDb()
  const steam = useSteamApi()

  const listApps = () => db().select().from(apps).orderBy(apps.name)

  async function getApp(appId: number): Promise<AppRow | null> {
    return (await db().select().from(apps).where(eq(apps.appId, appId)))[0] ?? null
  }

  async function updateApp(appId: number, patch: Partial<Omit<AppRow, 'appId'>>) {
    await db().update(apps).set(patch).where(eq(apps.appId, appId))
  }

  /** Creates the app row if needed, pre-filling name and install path from the local Steam install. */
  async function ensureApp(appId: number, fallbackName?: string): Promise<AppRow> {
    const existing = await getApp(appId)
    if (existing) return existing
    const installed = await steam.installedGame(appId).catch(() => null)
    let name = installed?.name ?? fallbackName ?? null
    if (!name) name = (await steam.appNames([appId]).catch(() => ({} as Record<string, string>)))[appId] ?? null
    await db().insert(apps).values({
      appId,
      name,
      installPath: installed?.installPath ?? null,
      createdAt: Date.now()
    }).onConflictDoNothing()
    return (await getApp(appId))!
  }

  /** Creates app rows for games found in the local Steam libraries; existing rows are left alone. */
  async function importInstalledGames(games: InstalledGame[]) {
    const now = Date.now()
    for (const game of games) {
      await db().insert(apps).values({
        appId: game.appId,
        name: game.name,
        installPath: game.installPath,
        createdAt: now
      }).onConflictDoNothing()
    }
  }

  const storeStale = (app: Pick<AppRow, 'storeCheckedAt'>) =>
    !app.storeCheckedAt || Date.now() - app.storeCheckedAt > STORE_MAX_AGE_MS

  /**
   * Fetches the app's Steam store metadata (banner, description, developers, ...) when missing or
   * stale, or always with `force`. Fills in the name if the app has none. Returns the updated row.
   */
  async function refreshStore(app: AppRow, force = false): Promise<AppRow> {
    if (!force && !storeStale(app)) return app
    const details = await steam.appDetails(app.appId)
    const patch = { store: details, storeCheckedAt: Date.now(), name: app.name ?? details?.name ?? null }
    await updateApp(app.appId, patch)
    return { ...app, ...patch }
  }

  async function upsertItems(details: ItemDetails[]) {
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

  /** Number of workshop items per app. */
  async function itemCountsByApp(): Promise<Record<number, number>> {
    const rows = await db().select({ appId: workshopItems.appId, n: count() }).from(workshopItems).groupBy(workshopItems.appId)
    return Object.fromEntries(rows.map(r => [r.appId, r.n]))
  }

  const listItems = (appId: number) =>
    db().select().from(workshopItems).where(eq(workshopItems.appId, appId)).orderBy(workshopItems.title)

  async function getItem(id: string): Promise<ItemRow | null> {
    return (await db().select().from(workshopItems).where(eq(workshopItems.id, id)))[0] ?? null
  }

  async function updateItem(id: string, patch: Partial<Omit<ItemRow, 'id'>>) {
    await db().update(workshopItems).set(patch).where(eq(workshopItems.id, id))
  }

  /** Latest downloaded revision per item. */
  async function latestSnapshotTimes(itemIds: string[]): Promise<Map<string, number>> {
    const latest = new Map<string, number>()
    if (!itemIds.length) return latest
    const rows = await db().select({ itemId: snapshots.itemId, timeUpdated: snapshots.timeUpdated })
      .from(snapshots).where(inArray(snapshots.itemId, itemIds)).orderBy(desc(snapshots.timeUpdated))
    for (const row of rows) if (!latest.has(row.itemId)) latest.set(row.itemId, row.timeUpdated)
    return latest
  }

  /**
   * Refreshes metadata from the Web API and returns items whose remote revision is newer than
   * their newest snapshot (or that have none yet).
   */
  async function checkUpdates(appId?: number): Promise<ItemRow[]> {
    const items = appId === undefined
      ? await db().select().from(workshopItems)
      : await listItems(appId)
    if (!items.length) return []
    const details = (await steam.itemDetails(items.map(i => i.id))).filter(d => d.result === 1)
    await upsertItems(details)
    const fresh = new Map(details.map(d => [d.id, d.timeUpdated]))
    const latest = await latestSnapshotTimes(items.map(i => i.id))
    return items
      .map(item => ({ ...item, remoteTimeUpdated: fresh.get(item.id) ?? item.remoteTimeUpdated }))
      .filter(item => item.remoteTimeUpdated > (latest.get(item.id) ?? 0))
  }

  async function removeItem(id: string) {
    await db().delete(workshopItems).where(eq(workshopItems.id, id))
  }

  async function itemsByIds(ids: string[]) {
    if (!ids.length) return []
    return db().select().from(workshopItems).where(inArray(workshopItems.id, ids))
  }

  async function itemsForApp(appId: number, ids: string[]) {
    return db().select().from(workshopItems).where(and(eq(workshopItems.appId, appId), inArray(workshopItems.id, ids)))
  }

  return { listApps, getApp, updateApp, ensureApp, importInstalledGames, storeStale, refreshStore, upsertItems, itemCountsByApp, listItems, getItem, updateItem, latestSnapshotTimes, checkUpdates, removeItem, itemsByIds, itemsForApp }
}
