import { defineConfig } from 'drizzle-kit'

// Only used by `bun run db:generate` to write SQL migrations into drizzle/.
// They are applied at runtime by app/db/migrate.ts, not by drizzle-kit.
export default defineConfig({
  dialect: 'sqlite',
  schema: './app/lib/db/schema.ts',
  out: './drizzle'
})
