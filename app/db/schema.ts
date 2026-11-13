import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { AdapterDefinition } from '~/adapters/types'

// Key/value app settings (library path, concurrency, poll interval). See composables/useSettings.ts.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull()
})

export type LinkMode = 'junction' | 'symlink'

export const apps = sqliteTable('apps', {
  appId: integer('app_id').primaryKey({ autoIncrement: false }),
  name: text('name'),
  // Game install folder; pre-filled from the local Steam install, user can override.
  installPath: text('install_path'),
  // Overrides the adapter's modsPath template when set.
  modsPath: text('mods_path'),
  linkMode: text('link_mode').$type<LinkMode>().notNull().default('junction'),
  adapterId: text('adapter_id'),
  detectedGameVersion: text('detected_game_version'),
  manualGameVersion: text('manual_game_version'),
  accountId: integer('account_id'),
  autoUpdate: integer('auto_update', { mode: 'boolean' }).notNull().default(false),
  // Snapshots kept per item (plus pinned and active ones). 0 = keep everything.
  retention: integer('retention').notNull().default(3),
  createdAt: integer('created_at').notNull()
})

export const adapters = sqliteTable('adapters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  appId: integer('app_id'),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  definition: text('definition', { mode: 'json' }).$type<AdapterDefinition>().notNull()
})

export const workshopItems = sqliteTable('workshop_items', {
  // publishedfileid, kept as text like the Web API returns it.
  id: text('id').primaryKey(),
  appId: integer('app_id').notNull(),
  title: text('title').notNull().default(''),
  author: text('author'),
  previewUrl: text('preview_url'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  remoteTimeUpdated: integer('remote_time_updated').notNull().default(0),
  fileSize: integer('file_size').notNull().default(0),
  activeSnapshotId: integer('active_snapshot_id'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  autoUpdate: integer('auto_update', { mode: 'boolean' }).notNull().default(true),
  addedAt: integer('added_at').notNull()
})

export const snapshots = sqliteTable('snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: text('item_id').notNull(),
  timeUpdated: integer('time_updated').notNull(),
  path: text('path').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  downloadedAt: integer('downloaded_at').notNull(),
  itemVersions: text('item_versions', { mode: 'json' }).$type<string[]>().notNull().default([]),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false)
}, t => [uniqueIndex('snapshots_item_time').on(t.itemId, t.timeUpdated)])

export type LinkStatus = 'ok' | 'missing' | 'broken' | 'drifted' | 'not_link'

export const links = sqliteTable('links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // One active link per item.
  itemId: text('item_id').notNull().unique(),
  appId: integer('app_id').notNull(),
  linkPath: text('link_path').notNull(),
  snapshotId: integer('snapshot_id').notNull(),
  type: text('type').$type<LinkMode>().notNull(),
  createdAt: integer('created_at').notNull(),
  status: text('status').$type<LinkStatus>().notNull().default('ok')
})

export type JobStatus = 'queued' | 'running' | 'done' | 'partial' | 'failed' | 'cancelled' | 'needs_guard' | 'interrupted'

export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  appId: integer('app_id').notNull(),
  itemIds: text('item_ids', { mode: 'json' }).$type<string[]>().notNull(),
  accountId: integer('account_id'),
  status: text('status').$type<JobStatus>().notNull(),
  workerSlot: integer('worker_slot'),
  bytesDone: integer('bytes_done').notNull().default(0),
  bytesTotal: integer('bytes_total').notNull().default(0),
  error: text('error'),
  logTail: text('log_tail'),
  createdAt: integer('created_at').notNull(),
  startedAt: integer('started_at'),
  finishedAt: integer('finished_at')
})

// No secrets here: passwords live in the OS keyring (see src-tauri/src/accounts.rs).
export const steamAccounts = sqliteTable('steam_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  lastLoginOk: integer('last_login_ok')
})

export type AppRow = typeof apps.$inferSelect
export type AdapterRow = typeof adapters.$inferSelect
export type ItemRow = typeof workshopItems.$inferSelect
export type SnapshotRow = typeof snapshots.$inferSelect
export type LinkRow = typeof links.$inferSelect
export type JobRow = typeof jobs.$inferSelect
export type AccountRow = typeof steamAccounts.$inferSelect
