export interface RetentionSnapshot {
  id: number
  timeUpdated: number
  pinned: boolean
}

/**
 * Snapshots to delete so that at most `keep` unpinned, inactive snapshots remain (newest kept).
 * Pinned snapshots, the active one and `protectedIds` (used by saved restore points) are never
 * returned and don't count towards `keep`. `keep` <= 0 keeps everything.
 */
export function snapshotsToPrune<T extends RetentionSnapshot>(snapshots: T[], keep: number, activeId: number | null, protectedIds: ReadonlySet<number> = new Set()): T[] {
  if (keep <= 0) return []
  const candidates = snapshots
    .filter(s => !s.pinned && s.id !== activeId && !protectedIds.has(s.id))
    .sort((a, b) => b.timeUpdated - a.timeUpdated)
  // The active snapshot counts towards the kept ones.
  const slots = Math.max(0, keep - (activeId !== null && snapshots.some(s => s.id === activeId) ? 1 : 0))
  return candidates.slice(slots)
}
