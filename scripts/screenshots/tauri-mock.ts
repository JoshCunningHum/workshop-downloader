// Stands in for the Tauri backend so the built UI runs in a plain browser: `pageInit` runs in the
// page and fakes `window.__TAURI_INTERNALS__`; everything except download jobs is forwarded to
// `createHandler` in Node, which answers SQL from the demo database and other commands with
// canned values.
import { DatabaseSync } from 'node:sqlite'
import { GAMES, itemDetails, toSql } from './demo-data.ts'

type Args = Record<string, unknown> | undefined

/** Runs in the page before the app loads. Must be self-contained (it is serialized). */
export function pageInit() {
  const callbacks = new Map<number, (payload: unknown) => void>()
  let nextCallback = 1
  let nextSlot = 0
  const w = window as unknown as Record<string, unknown>

  // A download job: worker slot, progress per item, then a finished snapshot. Speed is set by
  // `window.__demoItemMs` (time per item).
  function simulateJob(request: { jobId: string, appId: number, libraryPath: string, items: { id: string, timeUpdated: number, fileSize: number }[] }, channel: { id: number }) {
    let index = 0
    const send = (message: unknown) => callbacks.get(channel.id)?.({ message, index: index++ })
    const slot = nextSlot++ % 3
    const itemMs = Number(w.__demoItemMs ?? 20_000)
    send({ type: 'queued' })
    let t = 400
    const later = (ms: number, fn: () => void) => setTimeout(fn, (t += ms))
    later(300, () => send({ type: 'started', slot }))
    later(100, () => send({ type: 'log', line: 'Steam Console Client (c) Valve Corporation' }))
    later(100, () => send({ type: 'log', line: 'Logging in user \'anonymous\' to Steam Public...OK' }))
    later(100, () => send({ type: 'loginOk' }))
    for (const item of request.items) {
      const steps = 40
      for (let s = 1; s <= steps; s++) {
        // Ease in and out so the speed graph has some shape.
        const share = (1 - Math.cos((s / steps) * Math.PI)) / 2
        later(itemMs / steps, () => send({ type: 'progress', itemId: item.id, bytes: Math.round(item.fileSize * share), total: item.fileSize }))
      }
      later(200, () => {
        send({ type: 'log', line: `Success. Downloaded item ${item.id}` })
        send({ type: 'itemDone', itemId: item.id, timeUpdated: item.timeUpdated, path: `${request.libraryPath}\\${request.appId}\\${item.id}\\${item.timeUpdated}`, sizeBytes: item.fileSize })
      })
    }
    later(300, () => send({ type: 'finished', status: 'done', error: null }))
  }

  w.isTauri = true
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }
  w.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    transformCallback(callback: (payload: unknown) => void) {
      const id = nextCallback++
      callbacks.set(id, callback)
      return id
    },
    unregisterCallback(id: number) {
      callbacks.delete(id)
    },
    convertFileSrc: (path: string) => path,
    async invoke(cmd: string, args: Record<string, unknown> = {}) {
      if (cmd === 'job_start') {
        simulateJob(args.request as Parameters<typeof simulateJob>[0], args.onEvent as { id: number })
        return null
      }
      if (cmd === 'job_cancel') return true
      // Channels can't cross into Node; send their id instead.
      const plain = JSON.parse(JSON.stringify(args ?? {}))
      return (w.__demoInvoke as (cmd: string, args: unknown) => Promise<unknown>)(cmd, plain)
    }
  }
}

/** Answers forwarded commands. `unknown` collects commands with no canned answer. */
export function createHandler(dbPath: string, unknown: Set<string>) {
  const db = new DatabaseSync(dbPath)

  return (cmd: string, args: Args): unknown => {
    const a = args ?? {}
    const values = ((a.values as unknown[] | undefined) ?? []).map(toSql)
    switch (cmd) {
      case 'plugin:sql|load':
        return a.db
      case 'plugin:sql|execute': {
        const res = db.prepare(String(a.query)).run(...values)
        return [Number(res.changes), Number(res.lastInsertRowid)]
      }
      case 'plugin:sql|select':
        return db.prepare(String(a.query)).all(...values)
      case 'plugin:sql|close':
        return true
      case 'plugin:path|join':
        return (a.paths as string[]).join('\\').replace(/\\{2,}/g, '\\')
      case 'plugin:path|resolve_directory':
        return 'C:\\Users\\demo\\AppData\\Roaming\\com.kenshi.workshopdownloader'
      case 'plugin:event|listen':
        return Math.floor(Math.random() * 1e9)
      case 'plugin:event|unlisten':
      case 'plugin:event|emit':
      case 'plugin:log|log':
        return null
      case 'plugin:app|version':
        return '0.1.0'
      case 'steamcmd_status':
        return { installed: true, root: 'C:\\Users\\demo\\AppData\\Roaming\\com.kenshi.workshopdownloader\\steamcmd', concurrency: 3 }
      case 'steam_root_path':
        return 'C:\\Program Files (x86)\\Steam'
      case 'steam_installed_game':
        return null
      case 'steam_installed_games':
        return []
      case 'steam_app_names':
        return Object.fromEntries(GAMES.map(g => [g.appId, g.name]))
      case 'steam_app_details': {
        const row = db.prepare('SELECT store FROM apps WHERE app_id = ?').get(Number(a.appId)) as { store: string } | undefined
        return row ? JSON.parse(row.store) : null
      }
      case 'steam_item_details':
        return itemDetails(db, (a.ids as string[]) ?? [])
      case 'links_verify':
        return ((a.links as { id: number }[]) ?? []).map(l => ({ id: l.id, status: 'ok' }))
      case 'read_files':
        return []
      case 'fs_size':
      case 'snapshot_size':
        return { bytes: 48_200_000, files: 214 }
      case 'account_has_password':
        return false
      case 'mods_scan':
        return []
      case 'jobs_set_concurrency':
      case 'link_create':
      case 'link_remove':
      case 'snapshot_delete':
      case 'fs_watch':
      case 'fs_unwatch':
      case 'open_in_file_manager':
        return null
      default:
        if (cmd.startsWith('workshop_')) return null
        unknown.add(cmd)
        return null
    }
  }
}
