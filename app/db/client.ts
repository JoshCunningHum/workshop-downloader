import Database from '@tauri-apps/plugin-sql'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import * as schema from './schema'

// Relative paths resolve inside the app's config directory (tauri-plugin-sql).
export const DB_URL = 'sqlite:workshop-downloader.db'

export type Db = Awaited<ReturnType<typeof openDb>>['db']

export async function openDb(url = DB_URL) {
  const sqlite = await Database.load(url)

  const db = drizzle(async (sql, params, method) => {
    if (method === 'run') {
      await sqlite.execute(sql, params)
      return { rows: [] }
    }

    // plugin-sql returns rows as objects keyed by column name, while drizzle wants arrays in
    // select order. Object.values relies on the keys keeping column order, which breaks for
    // duplicate column names (e.g. un-aliased joins) and integer-like column names.
    const rows = await sqlite.select<Record<string, unknown>[]>(sql, params)
    const values = rows.map(row => Object.values(row))
    return { rows: method === 'get' ? values[0] as unknown[] : values }
  }, { schema })

  return { sqlite, db }
}
