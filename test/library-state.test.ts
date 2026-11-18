import { describe, expect, it } from 'vitest'
import { libraryState } from '~/utils/library-state'

describe('libraryState', () => {
  const items = [
    { id: '1', remoteTimeUpdated: 100 },
    { id: '2', remoteTimeUpdated: 200 },
    { id: '3', remoteTimeUpdated: 300 }
  ]

  it('splits downloaded items into current and outdated, leaving out the rest', () => {
    const latest = new Map([['1', 100], ['2', 150]])
    expect(libraryState(items, latest)).toEqual({ current: ['1'], outdated: ['2'] })
  })

  it('counts a snapshot newer than the stored remote revision as current', () => {
    expect(libraryState(items, new Map([['3', 400]]))).toEqual({ current: ['3'], outdated: [] })
  })
})
