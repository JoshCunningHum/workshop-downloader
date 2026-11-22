import type { DiskUsage } from '~/types/games'

/**
 * Splits snapshots into the bytes of the active revisions, the inactive ones, and their total.
 * Null when nothing is downloaded.
 */
export function diskUsage(
  items: ReadonlyArray<{ activeSnapshotId: number | null }>,
  snapshots: ReadonlyArray<{ id: number, sizeBytes: number }>
): DiskUsage | null {
  if (!snapshots.length) return null
  const activeIds = new Set(items.map(i => i.activeSnapshotId).filter((id): id is number => id !== null))
  let active = 0
  let total = 0
  for (const s of snapshots) {
    total += s.sizeBytes
    if (activeIds.has(s.id)) active += s.sizeBytes
  }
  return { active, inactive: total - active, total }
}
