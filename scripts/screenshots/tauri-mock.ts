// Stands in for the Tauri backend so the built UI runs in a plain browser: `pageInit` runs in the
// page and fakes `window.__TAURI_INTERNALS__`; everything except download jobs is forwarded to
// `createHandler` in Node, which answers SQL from the demo database and other commands with
// canned values.
import { DatabaseSync } from 'node:sqlite'
import type { Frame, Page } from 'playwright'
import { COLLECTION, GAMES, itemDetails, toSql } from './demo-data.ts'

type Args = Record<string, unknown> | undefined

/** Runs in the page before the app loads. Must be self-contained (it is serialized). */
export function pageInit() {
  // Init scripts also run in the Workshop iframe; only the app gets the fake backend.
  if (window.top !== window) return
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

  // `listen()` registrations, so Node can emit events (`__demoEmit`) the way Rust does.
  const listeners = new Map<string, Set<number>>()
  w.__demoEmit = (event: string, payload: unknown) => {
    for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id, payload })
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
      if (cmd === 'plugin:event|listen') {
        const event = String(args.event)
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(args.handler as number)
        return args.handler
      }
      if (cmd === 'plugin:event|unlisten') {
        listeners.get(String(args.event))?.delete(args.eventId as number)
        return null
      }
      // Channels can't cross into Node; send their id instead.
      const plain = JSON.parse(JSON.stringify(args ?? {}))
      return (w.__demoInvoke as (cmd: string, args: unknown) => Promise<unknown>)(cmd, plain)
    }
  }
}

const WORKSHOP_ORIGIN = 'https://steamcommunity.com'

/** Emits a Tauri event into the app page. */
export const emit = (page: Page, event: string, payload: unknown) =>
  page.evaluate(([e, p]) => (window as unknown as { __demoEmit: (e: string, p: unknown) => void }).__demoEmit(e as string, p), [event, payload]).catch(() => {})

/**
 * The Workshop browser: an iframe over the frame the app reserves for the native webview, with
 * the same state pushes (queued ids, library, options) after each page load that Rust makes.
 */
function workshopBrowser() {
  const state = { queued: [] as string[], library: { current: [] as string[], outdated: [] as string[] }, options: { openItemLinks: true } }
  const attached = new WeakSet<Page>()
  const frameOf = (page: Page) => page.frames().find(f => f.parentFrame() && f.url().startsWith(WORKSHOP_ORIGIN))

  const push = (frame: Frame) => frame.evaluate((s) => {
    const w = window as unknown as Record<string, ((v: unknown) => void) | undefined>
    w.__wsdSetOptions?.(s.options)
    w.__wsdSetLibrary?.(s.library)
    w.__wsdSetQueued?.(s.queued)
  }, state).catch(() => {})

  function attach(page: Page) {
    if (attached.has(page)) return
    attached.add(page)
    page.on('framenavigated', (frame) => {
      if (!frame.parentFrame() || !frame.url().startsWith(WORKSHOP_ORIGIN)) return
      void frame.waitForLoadState('domcontentloaded').then(() => push(frame)).then(() => emit(page, 'workshop://location', { url: frame.url() }))
    })
  }

  const place = (page: Page, bounds: Record<string, unknown>) => page.evaluate((b) => {
    let frame = document.getElementById('demo-workshop') as HTMLIFrameElement | null
    if (!frame) {
      frame = document.createElement('iframe')
      frame.id = 'demo-workshop'
      frame.style.cssText = 'position:fixed;border:0;z-index:5;background:#1e2430'
      document.body.appendChild(frame)
    }
    if (b.hide) {
      frame.style.display = 'none'
      return
    }
    Object.assign(frame.style, { display: 'block', left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` })
    if (b.url) frame.src = String(b.url)
  }, bounds)

  return async (page: Page, cmd: string, a: Record<string, unknown>) => {
    attach(page)
    const frame = frameOf(page)
    switch (cmd) {
      case 'workshop_show':
      case 'workshop_set_bounds':
        return place(page, a)
      case 'workshop_hide':
        return place(page, { hide: true })
      case 'workshop_navigate':
        return place(page, { ...(await page.evaluate(() => document.getElementById('demo-workshop')?.getBoundingClientRect().toJSON())), url: a.url })
      case 'workshop_back':
        return frame?.evaluate(() => history.back())
      case 'workshop_forward':
        return frame?.evaluate(() => history.forward())
      case 'workshop_reload':
        return frame?.evaluate(() => location.reload())
      case 'workshop_set_queued':
        state.queued = a.ids as string[]
        break
      case 'workshop_set_library':
        state.library = a.library as typeof state.library
        break
      case 'workshop_set_options':
        state.options = a.options as typeof state.options
        break
    }
    if (frame) await push(frame)
    return null
  }
}

/** Answers forwarded commands. `unknown` collects commands with no canned answer. */
export function createHandler(dbPath: string, unknown: Set<string>) {
  const db = new DatabaseSync(dbPath)
  const workshop = workshopBrowser()

  return (page: Page, cmd: string, args: Args): unknown => {
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
      case 'steam_resolve': {
        const ids = (a.ids as string[]) ?? []
        const collections = ids.filter(id => id === COLLECTION.id).map(id => ({ id, children: COLLECTION.children }))
        const items = ids.flatMap(id => (id === COLLECTION.id ? COLLECTION.children : [id]))
        return { items: itemDetails(db, [...new Set(items)]), collections }
      }
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
        if (cmd.startsWith('workshop_')) return workshop(page, cmd, a)
        unknown.add(cmd)
        return null
    }
  }
}
