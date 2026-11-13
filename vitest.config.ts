import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests for the pure TS parts (adapter engine, parsers, migrator). They don't need Nuxt
// or Tauri; tests that need a DOM opt into jsdom with `// @vitest-environment jsdom`.
export default defineConfig({
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) }
  },
  test: {
    include: ['test/**/*.test.ts']
  },
  optimizeDeps: {
    include: [
      '@tauri-apps/api/core',
      '@tauri-apps/api/path',
      '@tauri-apps/plugin-sql',
      '@vue/devtools-core',
      'drizzle-orm',
      'drizzle-orm/sqlite-core',
      'drizzle-orm/sqlite-proxy',
    ]
  }
})
