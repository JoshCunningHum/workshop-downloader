import { eq } from 'drizzle-orm'
import { command } from '~/lib/api/tauri'
import { db } from '~/lib/db/instance'
import { steamAccounts } from '~/lib/db/schema'
import * as apps from './apps'

// Steam accounts: usernames in the DB, passwords in the OS keyring (via Rust).

export const list = () => db().select().from(steamAccounts).orderBy(steamAccounts.username)

export async function get(id: number) {
  return (await db().select().from(steamAccounts).where(eq(steamAccounts.id, id)))[0] ?? null
}

export async function add(username: string, password: string) {
  username = username.trim()
  if (!/^[\w.-]+$/.test(username)) throw new Error('Steam usernames contain only letters, digits, _ . and -')
  await setPassword(username, password)
  await db().insert(steamAccounts).values({ username }).onConflictDoNothing()
}

export const setPassword = (username: string, password: string) => command('account_set_password', { username, password })

export const hasPassword = (username: string) => command<boolean>('account_has_password', { username })

export async function remove(id: number) {
  const account = await get(id)
  if (!account) return
  await command('account_delete_password', { username: account.username })
  await apps.clearAccount(id)
  await db().delete(steamAccounts).where(eq(steamAccounts.id, id))
}

export async function markLoginOk(id: number) {
  await db().update(steamAccounts).set({ lastLoginOk: Date.now() }).where(eq(steamAccounts.id, id))
}
