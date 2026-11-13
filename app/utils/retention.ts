export interface RetentionSnapshot {
  id: number
  timeUpdated: number
  pinned: boolean
}

/**
 * Snapshots to delete so that at most `keep` unpinned, inactive snapshots remain (newest kept).
 * Pinned snapshots and the active one are never returned. `keep` <= 0 keeps everything.
 */
export function snapshotsToPrune<T extends RetentionSnapshot>(snapshots: T[], keep: number, activeId: number | null): T[] {
  if (keep <= 0) return []
  const candidates = snapshots
    .filter(s => !s.pinned && s.id !== activeId)
    .sort((a, b) => b.timeUpdated - a.timeUpdated)
  // The active snapshot counts towards the kept ones.
  const slots = Math.max(0, keep - (activeId !== null && snapshots.some(s => s.id === activeId) ? 1 : 0))
  return candidates.slice(slots)
}
