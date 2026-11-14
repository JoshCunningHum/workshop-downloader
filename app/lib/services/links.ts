import { eq } from 'drizzle-orm'
import { command } from '~/lib/api/tauri'
import { db } from '~/lib/db/instance'
import { links, type LinkMode, type LinkRow, type LinkStatus } from '~/lib/db/schema'

// Links from a game's mods folder to the active snapshot: rows plus the links on disk.

export async function forItem(itemId: string): Promise<LinkRow | null> {
  return (await db().select().from(links).where(eq(links.itemId, itemId)))[0] ?? null
}

export const forApp = (appId: number) => db().select().from(links).where(eq(links.appId, appId))

export const listAll = () => db().select().from(links)

export async function upsert(itemId: string, values: { appId: number, linkPath: string, snapshotId: number, type: LinkMode, status: LinkStatus }) {
  await db().insert(links).values({ itemId, createdAt: Date.now(), ...values })
    .onConflictDoUpdate({ target: links.itemId, set: values })
}

export async function removeRow(id: number) {
  await db().delete(links).where(eq(links.id, id))
}

export async function setStatus(id: number, status: LinkStatus) {
  await db().update(links).set({ status }).where(eq(links.id, id))
}

/** Creates (or re-points) a link on disk. */
export const create = (args: { linkPath: string, target: string, mode: LinkMode, libraryPath: string }) => command('link_create', args)

/** Removes a link on disk if it points into the library. */
export const removeLink = (linkPath: string, libraryPath: string) => command('link_remove', { linkPath, libraryPath })

/** Checks links on disk against their expected targets. */
export const verify = (checks: { id: number, linkPath: string, expectedTarget: string }[]) =>
  command<{ id: number, status: LinkStatus }[]>('links_verify', { links: checks })
