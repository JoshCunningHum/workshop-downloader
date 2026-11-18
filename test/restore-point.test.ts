import { describe, expect, it } from 'vitest'
import { dayKey, eventsByDay, planRestore, stateAt, timelineRange, type HistoryEvent } from '~/utils/restore-point'

let nextId = 1
const ev = (itemId: string, at: number, fromSnapshotId: number | null, toSnapshotId: number | null): HistoryEvent =>
  ({ id: nextId++, itemId, at, fromSnapshotId, toSnapshotId })

const events = [
  ev('a', 100, null, 1),
  ev('b', 150, null, 3),
  ev('a', 200, 1, 2),
  ev('b', 250, 3, null),
  ev('c', 300, null, 5)
]

describe('stateAt', () => {
  it('takes the last change per item up to and including the time', () => {
    expect(stateAt(events, 200)).toEqual(new Map([['a', 2], ['b', 3]]))
  })

  it('leaves out items with no change yet', () => {
    expect(stateAt(events, 99).size).toBe(0)
  })

  it('orders by time, then id, whatever the input order', () => {
    const same = [ev('x', 10, null, 8), ev('x', 10, 8, 9)]
    expect(stateAt([...same].reverse(), 10).get('x')).toBe(9)
  })
})

describe('planRestore', () => {
  const current = new Map<string, number | null>([['a', 2], ['c', 5]])

  it('switches, links and unlinks back to the chosen time', () => {
    const plan = planRestore({ events, t: 150, current, existing: new Set([1, 2, 3, 5]) })
    expect(plan).toEqual([
      { itemId: 'a', from: 2, to: 1, action: 'switch' },
      { itemId: 'c', from: 5, to: null, action: 'unlink' },
      { itemId: 'b', from: null, to: 3, action: 'link' }
    ])
  })

  it('marks targets that no longer exist as missing', () => {
    const plan = planRestore({ events, t: 150, current, existing: new Set([2, 5]) })
    expect(plan.filter(c => c.action === 'missing').map(c => c.itemId)).toEqual(['a', 'b'])
  })

  it('is empty when the current links match the time', () => {
    expect(planRestore({ events, t: 300, current, existing: new Set([1, 2, 3, 5]) })).toEqual([])
  })
})

describe('eventsByDay and timelineRange', () => {
  it('groups by local day, oldest first', () => {
    const morning = new Date(2026, 10, 18, 9).getTime()
    const evening = new Date(2026, 10, 18, 21).getTime()
    const next = new Date(2026, 10, 19, 1).getTime()
    const days = eventsByDay([ev('a', evening, null, 1), ev('a', next, 1, 2), ev('b', morning, null, 3)])
    expect([...days.keys()]).toEqual(['2026-11-18', '2026-11-19'])
    expect(days.get('2026-11-18')!.map(e => e.at)).toEqual([morning, evening])
    expect(dayKey(next)).toBe('2026-11-19')
  })

  it('pads the timeline by an hour on each side', () => {
    expect(timelineRange([ev('a', 4_000_000, null, 1), ev('b', 5_000_000, null, 2)]))
      .toEqual({ start: 400_000, end: 8_600_000 })
    expect(timelineRange([])).toBeNull()
  })
})
