import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { desc, eq, inArray } from 'drizzle-orm'
import { expandTemplate } from '~/lib/adapters/engine'
import type { AdapterDefinition } from '~/types/adapters'
import { links, snapshots, workshopItems, type AppRow, type ItemRow, type LinkStatus, type SnapshotRow } from '~/lib/db/schema'

// Snapshots and the links that point the game's mod folder at the active one.
export function useLibrary() {
  const { db } = useDb()
  const { settings } = useSettings()
  const catalog = useCatalog()
  const adapters = useAdapters()

  function libraryPath(): string {
    const path = settings.value.libraryPath
    if (!path) throw new Error('Set a library folder in Settings first')
    return path
  }

  const listSnapshots = (itemId: string) =>
    db().select().from(snapshots).where(eq(snapshots.itemId, itemId)).orderBy(desc(snapshots.timeUpdated))

  async function getSnapshot(id: number): Promise<SnapshotRow | null> {
    return (await db().select().from(snapshots).where(eq(snapshots.id, id)))[0] ?? null
  }

  /** Records a finished download (same revision downloaded again replaces the row). */
  async function recordSnapshot(input: { itemId: string, timeUpdated: number, path: string, sizeBytes: number }) {
    const values = { ...input, downloadedAt: Date.now() }
    await db().insert(snapshots).values(values)
      .onConflictDoUpdate({ target: [snapshots.itemId, snapshots.timeUpdated], set: { path: input.path, sizeBytes: input.sizeBytes, downloadedAt: values.downloadedAt } })
    const row = (await db().select().from(snapshots).where(eq(snapshots.itemId, input.itemId)))
      .find(s => s.timeUpdated === input.timeUpdated)!
    return row
  }

  /** `{modsPath}/{linkName}` for an item, or null if the app has no mod folder configured. */
  async function linkPathFor(app: AppRow, item: ItemRow, adapter?: AdapterDefinition): Promise<string | null> {
    adapter ??= await adapters.forApp(app)
    const template = app.modsPath || adapter.modsPath
    if (!template) return null
    const mods = expandTemplate(template, { install: app.installPath, appId: app.appId })
    const name = expandTemplate(adapter.linkName || '{itemId}', { itemId: item.id, title: item.title, appId: app.appId })
    if (!mods || !name) return null
    return join(mods, name)
  }

  /** Makes a snapshot the active version: re-points (or creates) the item's link. */
  async function activate(snapshotId: number) {
    const snapshot = await getSnapshot(snapshotId)
    if (!snapshot) throw new Error('Snapshot not found')
    const item = await catalog.getItem(snapshot.itemId)
    if (!item) throw new Error('Item not found')
    const app = await catalog.ensureApp(item.appId)
    const linkPath = await linkPathFor(app, item)

    if (linkPath) {
      const existing = (await db().select().from(links).where(eq(links.itemId, item.id)))[0]
      // Link name template changed since: drop the old link before creating the new one.
      if (existing && existing.linkPath !== linkPath) {
        await invoke('link_remove', { linkPath: existing.linkPath, libraryPath: libraryPath() })
      }
      await invoke('link_create', { linkPath, target: snapshot.path, mode: app.linkMode, libraryPath: libraryPath() })
      const values = { appId: app.appId, linkPath, snapshotId, type: app.linkMode, status: 'ok' as LinkStatus }
      await db().insert(links).values({ itemId: item.id, createdAt: Date.now(), ...values })
        .onConflictDoUpdate({ target: links.itemId, set: values })
    }
    await catalog.updateItem(item.id, { activeSnapshotId: snapshotId })
    return { linked: !!linkPath }
  }

  async function unlink(itemId: string) {
    const existing = (await db().select().from(links).where(eq(links.itemId, itemId)))[0]
    if (existing) {
      await invoke('link_remove', { linkPath: existing.linkPath, libraryPath: libraryPath() })
      await db().delete(links).where(eq(links.id, existing.id))
    }
  }

  const linkFor = async (itemId: string) => (await db().select().from(links).where(eq(links.itemId, itemId)))[0] ?? null

  const linksForApp = (appId: number) => db().select().from(links).where(eq(links.appId, appId))

  /** Checks links on disk and stores their status ("verify links"). */
  async function verifyLinks(appId?: number) {
    const rows = appId === undefined ? await db().select().from(links) : await linksForApp(appId)
    if (!rows.length) return []
    const snaps = await db().select().from(snapshots).where(inArray(snapshots.id, rows.map(r => r.snapshotId)))
    const expected = new Map(snaps.map(s => [s.id, s.path]))
    const results = await invoke<{ id: number, status: LinkStatus }[]>('links_verify', {
      links: rows.map(r => ({ id: r.id, linkPath: r.linkPath, expectedTarget: expected.get(r.snapshotId) ?? '' }))
    })
    for (const r of results) await db().update(links).set({ status: r.status }).where(eq(links.id, r.id))
    return results
  }

  async function setPinned(snapshotId: number, pinned: boolean) {
    await db().update(snapshots).set({ pinned }).where(eq(snapshots.id, snapshotId))
  }

  async function deleteSnapshot(snapshotId: number) {
    const snapshot = await getSnapshot(snapshotId)
    if (!snapshot) return
    const item = await catalog.getItem(snapshot.itemId)
    if (item?.activeSnapshotId === snapshotId) throw new Error('This is the active version; make another one active or unlink first')
    await invoke('snapshot_delete', { libraryPath: libraryPath(), path: snapshot.path })
    await db().delete(snapshots).where(eq(snapshots.id, snapshotId))
  }

  /** Deletes old snapshots beyond the app's retention setting. */
  async function prune(itemId: string) {
    const item = await catalog.getItem(itemId)
    if (!item) return []
    const app = await catalog.getApp(item.appId)
    const doomed = snapshotsToPrune(await listSnapshots(itemId), app?.retention ?? 3, item.activeSnapshotId)
    for (const s of doomed) await deleteSnapshot(s.id)
    return doomed
  }

  /** Removes an item completely: link, snapshots on disk, rows. */
  async function removeItem(itemId: string) {
    await unlink(itemId)
    await catalog.updateItem(itemId, { activeSnapshotId: null })
    for (const s of await listSnapshots(itemId)) await deleteSnapshot(s.id)
    await db().delete(workshopItems).where(eq(workshopItems.id, itemId))
  }

  /** Re-runs adapter item-version detection for a snapshot. */
  async function detectVersions(snapshot: SnapshotRow, item: ItemRow, app: AppRow) {
    const adapter = await adapters.forApp(app)
    const itemVersions = await adapters.itemVersions(item, snapshot.path, adapter)
    await db().update(snapshots).set({ itemVersions }).where(eq(snapshots.id, snapshot.id))
    return itemVersions
  }

  return { libraryPath, listSnapshots, getSnapshot, recordSnapshot, linkPathFor, activate, unlink, linkFor, linksForApp, verifyLinks, setPinned, deleteSnapshot, prune, removeItem, detectVersions }
}
