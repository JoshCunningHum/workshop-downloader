import { describe, expect, it } from 'vitest'
import { diskUsage } from '~/utils/disk'

describe('diskUsage', () => {
  const items = [{ activeSnapshotId: 1 }, { activeSnapshotId: null }]

  it('splits snapshot bytes into active, inactive and total', () => {
    const snapshots = [
      { id: 1, sizeBytes: 100 },
      { id: 2, sizeBytes: 50 },
      { id: 3, sizeBytes: 25 }
    ]
    expect(diskUsage(items, snapshots)).toEqual({ active: 100, inactive: 75, total: 175 })
  })

  it('counts every snapshot as active when each item points at one', () => {
    expect(diskUsage([{ activeSnapshotId: 2 }], [{ id: 2, sizeBytes: 10 }])).toEqual({ active: 10, inactive: 0, total: 10 })
  })

  it('returns null with nothing downloaded', () => {
    expect(diskUsage(items, [])).toBeNull()
  })
})
