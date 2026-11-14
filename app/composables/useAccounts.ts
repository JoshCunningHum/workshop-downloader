import { invoke } from '@tauri-apps/api/core'
import { eq } from 'drizzle-orm'
import { apps, steamAccounts } from '~/lib/db/schema'

// Steam accounts: usernames in the DB, passwords in the OS keyring (via Rust).
export function useAccounts() {
  const { db } = useDb()

  const list = () => db().select().from(steamAccounts).orderBy(steamAccounts.username)

  async function get(id: number) {
    return (await db().select().from(steamAccounts).where(eq(steamAccounts.id, id)))[0] ?? null
  }

  async function add(username: string, password: string) {
    username = username.trim()
    if (!/^[\w.-]+$/.test(username)) throw new Error('Steam usernames contain only letters, digits, _ . and -')
    await invoke('account_set_password', { username, password })
    await db().insert(steamAccounts).values({ username }).onConflictDoNothing()
  }

  async function setPassword(username: string, password: string) {
    await invoke('account_set_password', { username, password })
  }

  const hasPassword = (username: string) => invoke<boolean>('account_has_password', { username })

  async function remove(id: number) {
    const account = await get(id)
    if (!account) return
    await invoke('account_delete_password', { username: account.username })
    await db().update(apps).set({ accountId: null }).where(eq(apps.accountId, id))
    await db().delete(steamAccounts).where(eq(steamAccounts.id, id))
  }

  async function markLoginOk(id: number) {
    await db().update(steamAccounts).set({ lastLoginOk: Date.now() }).where(eq(steamAccounts.id, id))
  }

  return { list, get, add, setPassword, hasPassword, remove, markLoginOk }
}
