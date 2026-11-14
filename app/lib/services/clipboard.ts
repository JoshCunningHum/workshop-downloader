import { readText as readClipboard } from '@tauri-apps/plugin-clipboard-manager'

// The system clipboard (read only; see the clipboard-manager:allow-read-text capability).

/** Text on the clipboard, or '' when it holds none. */
export async function readText(): Promise<string> {
  return (await readClipboard().catch(() => null)) ?? ''
}
