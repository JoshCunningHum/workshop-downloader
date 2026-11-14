import { STORE_MAX_AGE_MS } from '~/constants/apps'
import type { AppRow, ItemRow } from '~/lib/db/schema'
import * as apps from '~/lib/services/apps'
import * as items from '~/lib/services/items'
import * as snapshots from '~/lib/services/snapshots'
import * as steam from '~/lib/services/steam'
import type { InstalledGame } from '~/types/steam'

// Apps (games) and workshop items: creating them from Web API details, and update checks.
export function useCatalog() {
  /** Creates the app row if needed, pre-filling name and install path from the local Steam install. */
  async function ensureApp(appId: number, fallbackName?: string): Promise<AppRow> {
    const existing = await apps.get(appId)
    if (existing) return existing
    const installed = await steam.installedGame(appId).catch(() => null)
    let name = installed?.name ?? fallbackName ?? null
    if (!name) name = (await steam.appNames([appId]).catch(() => ({} as Record<string, string>)))[appId] ?? null
    await apps.insertIfMissing({ appId, name, installPath: installed?.installPath ?? null })
    return (await apps.get(appId))!
  }

  /** Creates app rows for games found in the local Steam libraries; existing rows are left alone. */
  async function importInstalledGames(games: InstalledGame[]) {
    for (const game of games) {
      await apps.insertIfMissing({ appId: game.appId, name: game.name, installPath: game.installPath })
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
    await apps.update(app.appId, patch)
    return { ...app, ...patch }
  }

  /**
   * Refreshes metadata from the Web API and returns items whose remote revision is newer than
   * their newest snapshot (or that have none yet).
   */
  async function checkUpdates(appId?: number): Promise<ItemRow[]> {
    const rows = appId === undefined ? await items.listAll() : await items.listForApp(appId)
    if (!rows.length) return []
    const details = (await steam.itemDetails(rows.map(i => i.id))).filter(d => d.result === 1)
    await items.upsert(details)
    const fresh = new Map(details.map(d => [d.id, d.timeUpdated]))
    const latest = await snapshots.latestTimes(rows.map(i => i.id))
    return rows
      .map(item => ({ ...item, remoteTimeUpdated: fresh.get(item.id) ?? item.remoteTimeUpdated }))
      .filter(item => item.remoteTimeUpdated > (latest.get(item.id) ?? 0))
  }

  return {
    listApps: apps.list,
    getApp: apps.get,
    updateApp: apps.update,
    itemCountsByApp: apps.itemCounts,
    ensureApp,
    importInstalledGames,
    storeStale,
    refreshStore,
    upsertItems: items.upsert,
    listItems: items.listForApp,
    getItem: items.get,
    updateItem: items.update,
    removeItem: items.remove,
    itemsByIds: items.byIds,
    itemsForApp: items.forApp,
    latestSnapshotTimes: snapshots.latestTimes,
    checkUpdates
  }
}
