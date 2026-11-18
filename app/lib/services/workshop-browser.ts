import { listen } from '@tauri-apps/api/event'
import { command } from '~/lib/api/tauri'

// The Workshop browser: a Steam Community page in a native child webview that the Workshop tab
// keeps over its content panel (see src-tauri/src/workshop_browser.rs).

export interface Bounds { x: number, y: number, width: number, height: number }

/** The rect plus the page's own height, which Rust uses to find where the page starts in the window. */
const withViewport = (bounds: Bounds) => ({ ...bounds, viewportHeight: window.innerHeight })

/** The workshop home page of a game. */
export const workshopHome = (appId: number) => `https://steamcommunity.com/app/${appId}/workshop/`

/** Shows the browser at `bounds` (creating it the first time); with a `url`, it also goes there. */
export const show = (bounds: Bounds, url?: string) => command('workshop_show', { url, ...withViewport(bounds) })

export const setBounds = (bounds: Bounds) => command('workshop_set_bounds', withViewport(bounds))

/** Hides the browser; it keeps its page and history. */
export const hide = () => command('workshop_hide')

export const navigate = (url: string) => command('workshop_navigate', { url })
export const back = () => command('workshop_back')
export const forward = () => command('workshop_forward')
export const reload = () => command('workshop_reload')

/** The ids the browser shows as "In queue". */
export const setQueued = (ids: string[]) => command('workshop_set_queued', { ids })

/** "Add to queue" clicks in the browser: workshop ids (items or collections). */
export const onAdd = (handler: (ids: string[]) => void) =>
  listen<{ ids: string[] }>('workshop://add', e => handler(e.payload.ids))

/** Each page the browser finishes loading. */
export const onLocation = (handler: (url: string) => void) =>
  listen<{ url: string }>('workshop://location', e => handler(e.payload.url))
