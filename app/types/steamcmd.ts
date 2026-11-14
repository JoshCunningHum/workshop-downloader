// Mirrors src-tauri/src/steamcmd/job.rs SteamCmdStatus and AppIndexEvent, and appinfo.rs AppEntry.

export interface SteamCmdStatus { installed: boolean, root: string, concurrency: number }

export interface AppEntry { appId: number, name: string | null, kind: string | null }

export type AppIndexEvent
  = | { type: 'log', line: string }
    | { type: 'package', count: number }
    | { type: 'app', entry: AppEntry, done: number, total: number }
