import { describe, expect, it } from 'vitest'
import { formatRelative } from '~/utils/format'

describe('formatRelative', () => {
  const now = 1_000_000_000

  it('shows seconds and minutes', () => {
    expect(formatRelative(now - 5, now * 1000)).toBe('just now')
    expect(formatRelative(now - 30, now * 1000)).toBe('30 seconds ago')
    expect(formatRelative(now - 300, now * 1000)).toBe('5 minutes ago')
  })

  it('shows hours, days, months and years', () => {
    expect(formatRelative(now - 3600, now * 1000)).toBe('1 hour ago')
    expect(formatRelative(now - 2 * 86400, now * 1000)).toBe('2 days ago')
    expect(formatRelative(now - 3 * 2592000, now * 1000)).toBe('3 months ago')
    expect(formatRelative(now - 31536000, now * 1000)).toBe('last year')
  })

  it('shows the future and the unknown', () => {
    expect(formatRelative(now + 3600, now * 1000)).toBe('in 1 hour')
    expect(formatRelative(null, now * 1000)).toBe('—')
    expect(formatRelative(0, now * 1000)).toBe('—')
  })
})
