import type { ImportStatus } from '~/types/mods'

/** Why a folder in the mods folder isn't offered for import. */
export const IMPORT_SKIP_REASONS: Record<Exclude<ImportStatus, 'ready'>, string> = {
  managed: 'Already managed by this app',
  link: 'A link to a folder outside the library; left alone',
  notFound: 'Not found on the Steam Workshop (removed, private, or not a workshop item)',
  otherGame: 'A workshop item of a different game',
  exists: 'This revision is already in the library'
}
