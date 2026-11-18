import { join } from '@tauri-apps/api/path'
import { expandTemplate } from '~/lib/adapters/engine'
import type { AppRow, ItemRow, SnapshotRow } from '~/lib/db/schema'
import * as items from '~/lib/services/items'
import * as links from '~/lib/services/links'
import * as snapshots from '~/lib/services/snapshots'
import type { AdapterDefinition } from '~/types/adapters'

// Snapshots and the links that point the game's mod folder at the active one.
export function useLibrary() {
  const { settings } = useSettings()
  const catalog = useCatalog()
  const adapters = useAdapters()

  function libraryPath(): string {
    const path = settings.value.libraryPath
    if (!path) throw new Error('Set a library folder in Settings first')
    return path
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
    const snapshot = await snapshots.get(snapshotId)
    if (!snapshot) throw new Error('Snapshot not found')
    const item = await items.get(snapshot.itemId)
    if (!item) throw new Error('Item not found')
    const app = await catalog.ensureApp(item.appId)
    const linkPath = await linkPathFor(app, item)

    if (linkPath) {
      const existing = await links.forItem(item.id)
      // Link name template changed since: drop the old link before creating the new one.
      if (existing && existing.linkPath !== linkPath) {
        await links.removeLink(existing.linkPath, libraryPath())
      }
      await links.create({ linkPath, target: snapshot.path, mode: app.linkMode, libraryPath: libraryPath() })
      await links.upsert(item.id, { appId: app.appId, linkPath, snapshotId, type: app.linkMode, status: 'ok' })
    }
    await items.update(item.id, { activeSnapshotId: snapshotId })
    return { linked: !!linkPath }
  }

  async function unlink(itemId: string) {
    const existing = await links.forItem(itemId)
    if (existing) {
      await links.removeLink(existing.linkPath, libraryPath())
      await links.removeRow(existing.id)
    }
  }

  /** Checks links on disk and stores their status ("verify links"). */
  async function verifyLinks(appId?: number) {
    const rows = appId === undefined ? await links.listAll() : await links.forApp(appId)
    if (!rows.length) return []
    const snaps = await snapshots.byIds(rows.map(r => r.snapshotId))
    const expected = new Map(snaps.map(s => [s.id, s.path]))
    const results = await links.verify(rows.map(r => ({ id: r.id, linkPath: r.linkPath, expectedTarget: expected.get(r.snapshotId) ?? '' })))
    for (const r of results) await links.setStatus(r.id, r.status)
    return results
  }

  async function deleteSnapshot(snapshotId: number) {
    const snapshot = await snapshots.get(snapshotId)
    if (!snapshot) return
    const item = await items.get(snapshot.itemId)
    if (item?.activeSnapshotId === snapshotId) throw new Error('This is the active version; make another one active or unlink first')
    await snapshots.deleteFolder(libraryPath(), snapshot.path)
    await snapshots.removeRow(snapshotId)
  }

  /** Deletes old snapshots beyond the app's retention setting. */
  async function prune(itemId: string) {
    const item = await items.get(itemId)
    if (!item) return []
    const app = await catalog.getApp(item.appId)
    const doomed = snapshotsToPrune(await snapshots.listForItem(itemId), app?.retention ?? 3, item.activeSnapshotId)
    for (const s of doomed) await deleteSnapshot(s.id)
    return doomed
  }

  /** Removes an item completely: link, snapshots on disk, rows. */
  async function removeItem(itemId: string) {
    await unlink(itemId)
    await items.update(itemId, { activeSnapshotId: null })
    for (const s of await snapshots.listForItem(itemId)) await deleteSnapshot(s.id)
    await items.remove(itemId)
  }

  /** Re-runs adapter item-version detection for a snapshot. */
  async function detectVersions(snapshot: SnapshotRow, item: ItemRow, app: AppRow) {
    const adapter = await adapters.forApp(app)
    const itemVersions = await adapters.itemVersions(item, snapshot.path, adapter)
    await snapshots.setItemVersions(snapshot.id, itemVersions)
    return itemVersions
  }

  /**
   * Re-runs item-version detection for every snapshot of an app's items with the app's current
   * adapter. Needed whenever that adapter (or its rules) changes; returns the snapshots updated.
   */
  async function redetectApp(appId: number) {
    const app = await catalog.getApp(appId)
    if (!app) return 0
    const adapter = await adapters.forApp(app)
    let updated = 0
    for (const item of await items.listForApp(appId)) {
      for (const snapshot of await snapshots.listForItem(item.id)) {
        await snapshots.setItemVersions(snapshot.id, await adapters.itemVersions(item, snapshot.path, adapter))
        updated++
      }
    }
    return updated
  }

  return {
    libraryPath,
    listSnapshots: snapshots.listForItem,
    getSnapshot: snapshots.get,
    recordSnapshot: snapshots.record,
    linkPathFor,
    activate,
    unlink,
    linkFor: links.forItem,
    linksForApp: links.forApp,
    verifyLinks,
    setPinned: snapshots.setPinned,
    deleteSnapshot,
    prune,
    removeItem,
    detectVersions,
    redetectApp
  }
}
