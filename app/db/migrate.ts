// Applies the SQL files that `drizzle-kit generate` writes to drizzle/, in filename order.
// Applied migrations are recorded by name in __drizzle_migrations.

export interface Migration {
  name: string
  statements: string[]
}

export interface SqlExecutor {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>
  select<T>(query: string, bindValues?: unknown[]): Promise<T>
}

const bundled = import.meta.glob<string>('../../drizzle/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true
})

export function loadMigrations(sources: Record<string, string> = bundled): Migration[] {
  return Object.entries(sources)
    .map(([path, sql]) => ({
      name: path.split('/').pop()!.replace(/\.sql$/, ''),
      statements: sql
        .split('--> statement-breakpoint')
        .map(statement => statement.trim())
        .filter(Boolean)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Statements run one by one without a wrapping transaction: plugin-sql uses a connection
// pool, so BEGIN/COMMIT sent as separate calls may not reach the same connection. A migration
// that fails partway is not recorded, and is retried from its first statement on next start.
export async function migrate(sqlite: SqlExecutor, migrations: Migration[] = loadMigrations()) {
  await sqlite.execute(
    'CREATE TABLE IF NOT EXISTS __drizzle_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)'
  )

  const rows = await sqlite.select<{ name: string }[]>('SELECT name FROM __drizzle_migrations')
  const applied = new Set(rows.map(row => row.name))

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue

    for (const statement of migration.statements) {
      await sqlite.execute(statement)
    }
    await sqlite.execute(
      'INSERT INTO __drizzle_migrations (name, applied_at) VALUES (?, ?)',
      [migration.name, Date.now()]
    )
  }
}
