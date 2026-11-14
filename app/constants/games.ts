import type { LinkMode } from '~/lib/db/schema'

export const LINK_MODES: { label: string, value: LinkMode }[] = [
  { label: 'Junction (no admin needed)', value: 'junction' },
  { label: 'Symlink (needs Developer Mode)', value: 'symlink' }
]

/** USelect (Reka UI) rejects '' as an item value, so "Automatic" (adapterId null) uses a sentinel. */
export const AUTO_ADAPTER = '__auto__'
