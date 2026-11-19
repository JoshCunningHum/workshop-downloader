import { describe, expect, it } from 'vitest'
import { snapshotsToPrune } from '~/utils/retention'

const snap = (id: number, timeUpdated: number, pinned = false) => ({ id, timeUpdated, pinned })

describe('snapshotsToPrune', () => {
  const snaps = [snap(1, 100), snap(2, 200, true), snap(3, 300), snap(4, 400), snap(5, 500)]

  it('keeps the newest K including the active one, never pinned', () => {
    expect(snapshotsToPrune(snaps, 2, 5).map(s => s.id)).toEqual([3, 1])
  })

  it('keeps an old active snapshot and counts it', () => {
    expect(snapshotsToPrune(snaps, 2, 1).map(s => s.id)).toEqual([4, 3])
  })

  it('keeps everything with K = 0', () => {
    expect(snapshotsToPrune(snaps, 0, null)).toEqual([])
  })

  it('works without an active snapshot', () => {
    expect(snapshotsToPrune(snaps, 1, null).map(s => s.id)).toEqual([4, 3, 1])
  })

  it('never deletes protected snapshots and does not count them', () => {
    expect(snapshotsToPrune(snaps, 1, null, new Set([1, 4])).map(s => s.id)).toEqual([3])
  })
})
