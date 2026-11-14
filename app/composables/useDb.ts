import type { Db } from '~/lib/db/client'

let instance: Db | undefined

export function setDb(db: Db) {
  instance = db
}

export function useDb() {
  const ready = useState('db:ready', () => false)
  const error = useState<string | null>('db:error', () => null)

  return {
    ready: readonly(ready),
    error: readonly(error),
    db(): Db {
      if (!instance) throw new Error('Database is not open yet')
      return instance
    }
  }
}
