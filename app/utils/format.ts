export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`
}

export function formatTime(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleString()
}

export function formatMs(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}

/** Unix seconds as "just now", "5 min ago", "2 days ago"; "—" when unknown. */
export function formatRelative(seconds: number | null | undefined, now = Date.now()): string {
  if (!seconds) return '—'
  const diff = Math.round((now - seconds * 1000) / 1000)
  const abs = Math.abs(diff)
  if (abs < 10) return 'just now'
  let value: number
  let unit: Intl.RelativeTimeFormatUnit
  if (abs < 60) [value, unit] = [abs, 'second']
  else if (abs < 3600) [value, unit] = [Math.floor(abs / 60), 'minute']
  else if (abs < 86400) [value, unit] = [Math.floor(abs / 3600), 'hour']
  else if (abs < 2592000) [value, unit] = [Math.floor(abs / 86400), 'day']
  else if (abs < 31536000) [value, unit] = [Math.floor(abs / 2592000), 'month']
  else [value, unit] = [Math.floor(abs / 31536000), 'year']
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(diff < 0 ? value : -value, unit)
}

/** Seconds as m:ss or h:mm:ss; "—" when unknown. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor(s % 3600 / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}
