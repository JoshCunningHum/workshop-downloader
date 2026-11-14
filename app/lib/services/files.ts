import { channel, command } from '~/lib/api/tauri'

// The local file system: showing paths in the file manager, and the fswatch sidecar.

/** Opens a folder (or reveals a file) in the default file manager; missing paths open their closest parent. */
export const openInFileManager = (path: string) => command('open_in_file_manager', { path })

export interface Totals { bytes: number, files: number }

/** Total size and file count of a folder. */
export const size = (path: string) => command<Totals>('fs_size', { path })

/** Watches folders; updated totals arrive on `onTotals` every `intervalMs`. */
export const watch = (id: string, paths: string[], intervalMs: number, onTotals: (totals: Totals) => void) =>
  command('fs_watch', { id, paths, intervalMs, onEvent: channel(onTotals) })

export const unwatch = (id: string) => command('fs_unwatch', { id })
