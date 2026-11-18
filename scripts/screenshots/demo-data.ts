// A made-up library for the README screenshots: three fictional games, their workshop items,
// snapshots and a few weeks of link history, all relative to now. Nothing here is real data.
import { DatabaseSync } from 'node:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { banner, thumbnail } from './art.ts'

const HOUR = 3_600_000
const DAY = 24 * HOUR
export const LIBRARY = 'D:\\WorkshopLibrary'

interface DemoGame {
  appId: number
  name: string
  hue: number
  version: string
  description: string
  developer: string
  genres: string[]
  modsPath: string
  items: { title: string, author: string, size: number, versions: string[] }[]
}

export const GAMES: DemoGame[] = [
  {
    appId: 4300100,
    name: 'Starfall Colony',
    hue: 205,
    version: '1.6',
    description: 'Build a settlement on a hostile moon, keep your colonists fed and sane, and trade with passing ships.',
    developer: 'Lantern Moth Games',
    genres: ['Simulation', 'Strategy'],
    modsPath: 'D:\\Games\\Starfall Colony\\Mods',
    items: [
      { title: 'Expanded Hydroponics', author: 'greenthumb', size: 48_200_000, versions: ['1.5', '1.6'] },
      { title: 'Better Pathfinding', author: 'astar', size: 2_100_000, versions: ['1.6'] },
      { title: 'Orbital Trade Hub', author: 'cargo_cult', size: 136_000_000, versions: ['1.5', '1.6'] },
      { title: 'Colonist Moods Overhaul', author: 'feelings', size: 9_800_000, versions: ['1.6'] },
      { title: 'Quiet Nights Music Pack', author: 'lullaby', size: 412_000_000, versions: ['1.4', '1.5', '1.6'] },
      { title: 'Deep Core Mining', author: 'drillbit', size: 22_500_000, versions: ['1.5'] },
      { title: 'Faction Diplomacy+', author: 'envoy', size: 6_400_000, versions: ['1.6'] },
      { title: 'UI Tweaks Collection', author: 'pixelpush', size: 3_300_000, versions: ['1.5', '1.6'] },
      { title: 'Weather of Kepler', author: 'stormchaser', size: 71_000_000, versions: ['1.6'] }
    ]
  },
  {
    appId: 4300200,
    name: 'Ironvale Tactics',
    hue: 18,
    version: '2.3.1',
    description: 'Turn-based skirmishes across a fractured kingdom, one stubborn hill fort at a time.',
    developer: 'Copperline',
    genres: ['Strategy', 'Turn-Based'],
    modsPath: 'D:\\Games\\Ironvale Tactics\\workshop',
    items: [
      { title: 'Siege Engines Expanded', author: 'trebuchet', size: 88_000_000, versions: [] },
      { title: 'Hardcore AI', author: 'nomercy', size: 1_200_000, versions: [] },
      { title: 'Northern Clans Faction', author: 'fjord', size: 154_000_000, versions: [] },
      { title: 'Readable Map Labels', author: 'cartog', size: 900_000, versions: [] },
      { title: 'Campaign Rebalance', author: 'ledger', size: 4_700_000, versions: [] }
    ]
  },
  {
    appId: 4300300,
    name: 'Harbor Lights',
    hue: 280,
    version: '0.9',
    description: 'A cosy fishing village where the lighthouse keeper knows everyone\'s secrets.',
    developer: 'Small Boat Studio',
    genres: ['Casual', 'Life Sim'],
    modsPath: 'D:\\Games\\Harbor Lights\\mods',
    items: [
      { title: 'More Fish Species', author: 'angler', size: 31_000_000, versions: [] },
      { title: 'Lighthouse Remastered', author: 'beacon', size: 57_000_000, versions: [] },
      { title: 'Seasonal Festivals', author: 'lantern', size: 12_000_000, versions: [] },
      { title: 'Cozy Furniture Set', author: 'woodgrain', size: 19_000_000, versions: [] }
    ]
  }
]

const itemId = (appId: number, i: number) => String(3_100_000_000 + (appId % 1000) * 100 + i)

interface Ev { appId: number, itemId: string, kind: string, from: number | null, to: number | null, at: number }

/** Builds the demo database at `path` (migrations applied, rows seeded). */
export function buildDemoDb(path: string, migrationsDir: string, now = Date.now()) {
  const db = new DatabaseSync(path)
  applyMigrations(db, migrationsDir)

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  // A time of day some days back. Today's times that haven't happened yet (an early-morning run)
  // move to two hours ago, keeping their minutes.
  const at = (daysAgo: number, hour: number, minute = 0) => {
    const t = today.getTime() - daysAgo * DAY + hour * HOUR + minute * 60_000
    return daysAgo === 0 && t > now - 20 * 60_000 ? now - 2 * HOUR + minute * 60_000 : t
  }

  const insert = (table: string, row: Record<string, unknown>) => {
    const keys = Object.keys(row)
    const values = keys.map(k => toSql(row[k]))
    return db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...values)
  }

  insert('settings', { key: 'steamPath', value: JSON.stringify('C:\\Program Files (x86)\\Steam') })
  insert('settings', { key: 'libraryPath', value: JSON.stringify(LIBRARY) })
  insert('settings', { key: 'updateCheckEnabled', value: JSON.stringify(true) })
  for (const g of GAMES) insert('steam_apps', { app_id: g.appId, name: g.name, type: 'game', updated_at: now })

  const events: Ev[] = []
  const snapshotsByItem = new Map<string, { id: number, timeUpdated: number }[]>()
  const latestRevision = new Map<string, number>()

  /** A finished download: new snapshot, linked right away. */
  function download(appId: number, id: string, when: number, size: number, versions: string[]) {
    const timeUpdated = Math.floor((when - 7 * HOUR) / 1000)
    const res = insert('snapshots', {
      item_id: id,
      time_updated: timeUpdated,
      path: `${LIBRARY}\\${appId}\\${id}\\${timeUpdated}`,
      size_bytes: size,
      downloaded_at: when,
      item_versions: JSON.stringify(versions),
      pinned: 0
    })
    const snapId = Number(res.lastInsertRowid)
    const list = snapshotsByItem.get(id) ?? []
    const from = current.get(id) ?? null
    list.push({ id: snapId, timeUpdated })
    snapshotsByItem.set(id, list)
    latestRevision.set(id, timeUpdated)
    events.push({ appId, itemId: id, kind: 'download', from, to: snapId, at: when })
    current.set(id, snapId)
    return snapId
  }
  const current = new Map<string, number | null>()

  for (const g of GAMES) {
    insert('apps', {
      app_id: g.appId,
      name: g.name,
      install_path: g.modsPath.replace(/\\[^\\]+$/, ''),
      mods_path: g.modsPath,
      link_mode: 'junction',
      manual_game_version: g.version,
      auto_update: g.appId === 4300100 ? 1 : 0,
      retention: 3,
      store: JSON.stringify({
        name: g.name,
        kind: 'game',
        shortDescription: g.description,
        headerImage: banner(g.name, g.hue),
        capsuleImage: null,
        developers: [g.developer],
        publishers: [g.developer],
        genres: g.genres,
        releaseDate: '2025',
        website: null
      }),
      store_checked_at: now,
      created_at: now - 40 * DAY
    })

    g.items.forEach((it, i) => {
      const id = itemId(g.appId, i)
      insert('workshop_items', {
        id,
        app_id: g.appId,
        title: it.title,
        author: it.author,
        preview_url: thumbnail(it.title, g.hue + i * 23),
        tags: JSON.stringify(g.genres.slice(0, 1)),
        remote_time_updated: 0,
        file_size: it.size,
        pinned: 0,
        auto_update: 1,
        held: 0,
        added_at: now - 30 * DAY
      })
      // Everything was first downloaded three weeks ago, a minute apart.
      download(g.appId, id, at(21, 19, i * 2), it.size, it.versions)
    })
  }

  // Starfall Colony gets the interesting history.
  const sf = GAMES[0]!
  const sfId = (i: number) => itemId(sf.appId, i)
  const sfItem = (i: number) => sf.items[i]!
  const update = (i: number, when: number, grow = 1.04, versions = sfItem(i).versions) =>
    download(sf.appId, sfId(i), when, Math.round(sfItem(i).size * grow), versions)

  update(2, at(14, 20, 5))
  update(4, at(14, 20, 9), 1.1)
  // A manual switch back and an unlink.
  const back = snapshotsByItem.get(sfId(4))![0]!.id
  events.push({ appId: sf.appId, itemId: sfId(4), kind: 'activate', from: current.get(sfId(4))!, to: back, at: at(9, 21, 30) })
  current.set(sfId(4), back)
  events.push({ appId: sf.appId, itemId: sfId(8), kind: 'unlink', from: current.get(sfId(8))!, to: null, at: at(9, 21, 34) })
  current.set(sfId(8), null)
  update(0, at(5, 18, 2))
  update(3, at(5, 18, 3))
  update(6, at(5, 18, 5))
  update(1, at(2, 22, 40))
  // This morning's "Update outdated": the run you might want to undo.
  update(0, at(0, 9, 12), 1.08)
  update(2, at(0, 9, 13), 1.02)
  update(3, at(0, 9, 15), 1.05, ['1.6'])
  update(5, at(0, 9, 16), 1.12, ['1.6'])
  update(7, at(0, 9, 18), 1.01)

  // Two items have newer revisions on Steam than what's downloaded.
  for (const g of GAMES) {
    g.items.forEach((_, i) => {
      const id = itemId(g.appId, i)
      const newer = (g.appId === sf.appId && (i === 1 || i === 6)) || (g.appId === 4300200 && i === 2)
      const remote = latestRevision.get(id)! + (newer ? 2 * 86_400 : 0)
      db.prepare('UPDATE workshop_items SET remote_time_updated = ? WHERE id = ?').run(remote, id)
    })
  }

  for (const e of events) {
    insert('snapshot_events', { app_id: e.appId, item_id: e.itemId, kind: e.kind, from_snapshot_id: e.from, to_snapshot_id: e.to, at: e.at })
  }
  for (const g of GAMES) {
    g.items.forEach((_, i) => {
      const id = itemId(g.appId, i)
      const snap = current.get(id) ?? null
      db.prepare('UPDATE workshop_items SET active_snapshot_id = ? WHERE id = ?').run(snap ?? snapshotsByItem.get(id)!.at(-1)!.id, id)
      if (snap === null) return
      insert('links', {
        item_id: id,
        app_id: g.appId,
        link_path: `${g.modsPath}\\${id}`,
        snapshot_id: snap,
        type: 'junction',
        created_at: now - 21 * DAY,
        status: 'ok'
      })
    })
  }

  // A few finished jobs for the Downloads page.
  const jobs = [
    { app: sf.appId, items: [0, 2, 3, 5, 7], at: at(0, 9, 11), took: 7 * 60_000 },
    { app: sf.appId, items: [1], at: at(2, 22, 39), took: 70_000 }
  ]
  jobs.forEach((j, n) => insert('jobs', {
    id: `job-demo-${n}`,
    app_id: j.app,
    item_ids: JSON.stringify(j.items.map(sfId)),
    status: 'done',
    worker_slot: 1,
    bytes_done: j.items.reduce((s, i) => s + sfItem(i).size, 0),
    bytes_total: j.items.reduce((s, i) => s + sfItem(i).size, 0),
    created_at: j.at,
    started_at: j.at + 2000,
    finished_at: j.at + j.took
  }))

  db.close()
}

/** The same thing app/lib/db/migrate.ts does at startup, so the app finds them applied. */
function applyMigrations(db: DatabaseSync, dir: string) {
  db.exec('CREATE TABLE IF NOT EXISTS __drizzle_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    for (const statement of readFileSync(join(dir, file), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) {
      db.exec(statement)
    }
    db.prepare('INSERT INTO __drizzle_migrations (name, applied_at) VALUES (?, ?)').run(file.replace(/\.sql$/, ''), Date.now())
  }
}

/** Item details for the Steam Web API mock (tooltips, item page). */
export function itemDetails(db: DatabaseSync, ids: string[]) {
  return ids.flatMap((id) => {
    const row = db.prepare('SELECT * FROM workshop_items WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!row) return []
    return [{
      id,
      result: 1,
      appId: row.app_id,
      title: row.title,
      creator: row.author,
      previewUrl: row.preview_url,
      fileSize: row.file_size,
      timeCreated: Number(row.remote_time_updated) - 200 * 86_400,
      timeUpdated: row.remote_time_updated,
      tags: JSON.parse(String(row.tags)),
      banned: false,
      description: `[h1]${row.title}[/h1]\nA demo workshop item for the README screenshots.\n[list][*]Works with the latest version[*]Safe to add to an existing save[/list]`,
      subscriptions: 12_000 + (Number(id) % 7919) * 13,
      favorited: 900 + (Number(id) % 997),
      views: 40_000 + (Number(id) % 7919) * 31
    }]
  })
}

export function toSql(value: unknown) {
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === undefined) return null
  return value as string | number | null
}
