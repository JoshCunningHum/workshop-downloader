import { describe, expect, it } from 'vitest'
import { loadMigrations, migrate, type SqlExecutor } from '~/lib/db/migrate'

function fakeDb() {
  const executed: string[] = []
  const applied: string[] = []
  const db: SqlExecutor = {
    async execute(query, params) {
      executed.push(query)
      if (query.startsWith('INSERT INTO __drizzle_migrations')) applied.push(params![0] as string)
      if (query.includes('FAIL')) throw new Error('boom')
      return undefined
    },
    async select<T>() {
      return applied.map(name => ({ name })) as T
    }
  }
  return { db, executed, applied }
}

describe('migrate', () => {
  it('splits on statement breakpoints and sorts by name', () => {
    const migrations = loadMigrations({
      '../../drizzle/0001_b.sql': 'CREATE TABLE b (x);\n--> statement-breakpoint\nCREATE INDEX i ON b (x);',
      '../../drizzle/0000_a.sql': 'CREATE TABLE a (x);'
    })
    expect(migrations).toEqual([
      { name: '0000_a', statements: ['CREATE TABLE a (x);'] },
      { name: '0001_b', statements: ['CREATE TABLE b (x);', 'CREATE INDEX i ON b (x);'] }
    ])
  })

  it('applies pending migrations once', async () => {
    const { db, applied, executed } = fakeDb()
    const migrations = [{ name: '0000', statements: ['S1'] }, { name: '0001', statements: ['S2', 'S3'] }]
    await migrate(db, migrations)
    await migrate(db, migrations)
    expect(applied).toEqual(['0000', '0001'])
    expect(executed.filter(q => q.startsWith('S'))).toEqual(['S1', 'S2', 'S3'])
  })

  it('does not record a migration that failed', async () => {
    const { db, applied } = fakeDb()
    await expect(migrate(db, [{ name: '0000', statements: ['OK', 'FAIL'] }])).rejects.toThrow('boom')
    expect(applied).toEqual([])
  })

  it('bundles the generated migrations', () => {
    const names = loadMigrations().map(m => m.name)
    expect(names[0]).toMatch(/^0000_/)
    expect(names.length).toBeGreaterThanOrEqual(2)
  })
})
