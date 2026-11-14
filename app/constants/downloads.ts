import type { DownloadTab } from '~/types/downloads'
import type { ItemState } from '~/types/jobs'

/** States shown in the Active tab, in sort order for equal progress. */
export const ACTIVE_ORDER: ItemState[] = ['downloading', 'waiting', 'queued']

/** The tabs of the Downloads page; the selected tab takes its colour. */
export const DOWNLOAD_TABS: Record<DownloadTab, { label: string, icon: string, color: 'primary' | 'neutral' | 'error' | 'info', empty: { title: string, description: string } }> = {
  queue: { label: 'Queue', icon: 'i-lucide-list-plus', color: 'info', empty: { title: 'Queue is empty', description: 'Paste workshop links or ids to queue them.' } },
  active: { label: 'Active', icon: 'i-lucide-download', color: 'primary', empty: { title: 'Nothing downloading', description: 'Queued and downloading items show up here.' } },
  finished: { label: 'Finished', icon: 'i-lucide-circle-check', color: 'neutral', empty: { title: 'No finished downloads', description: 'Items that downloaded successfully show up here.' } },
  failed: { label: 'Failed', icon: 'i-lucide-circle-x', color: 'error', empty: { title: 'No failed downloads', description: 'Failed, cancelled and interrupted items show up here.' } }
}

/** Badge colour per item state. */
export const ITEM_STATE_COLORS = {
  queued: 'neutral',
  waiting: 'neutral',
  downloading: 'primary',
  done: 'success',
  failed: 'error',
  cancelled: 'neutral',
  needs_guard: 'warning',
  interrupted: 'neutral'
} as const satisfies Record<ItemState, string>
