import { Channel, invoke } from '@tauri-apps/api/core'

// The one place that talks to the Rust backend; services build on these two helpers.
// Errors are passed through as Rust sends them (the message string).

/** Calls a Tauri command. */
export function command<T = void>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args)
}

/** A channel a command streams events to; `onEvent` receives each one in order. */
export function channel<E>(onEvent?: (event: E) => void): Channel<E> {
  const ch = new Channel<E>()
  if (onEvent) ch.onmessage = onEvent
  return ch
}
