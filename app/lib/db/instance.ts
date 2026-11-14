import type { Db } from './client'

// The open database, set once by plugins/db.client.ts before the app renders.
let instance: Db | undefined

export function setDb(db: Db) {
  instance = db
}

export function db(): Db {
  if (!instance) throw new Error('Database is not open yet')
  return instance
}
