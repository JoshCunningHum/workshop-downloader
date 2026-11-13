import { describe, expect, it } from 'vitest'
import { parseJsonPath, queryJsonPath } from '~/adapters/jsonPath'

describe('jsonPath', () => {
  const data = { a: { b: [{ v: '1.0' }, { v: '1.1' }] }, 'with space': 2 }

  it('parses segments', () => {
    expect(parseJsonPath('$.a.b[0].v')).toEqual(['a', 'b', 0, 'v'])
    expect(parseJsonPath('a.b[*]')).toEqual(['a', 'b', '*'])
    expect(parseJsonPath(`$['with space']`)).toEqual(['with space'])
    expect(() => parseJsonPath('$.a..b')).toThrow()
  })

  it('queries values with indexes and wildcards', () => {
    expect(queryJsonPath(data, '$.a.b[1].v')).toEqual(['1.1'])
    expect(queryJsonPath(data, '$.a.b[*].v')).toEqual(['1.0', '1.1'])
    expect(queryJsonPath(data, `$['with space']`)).toEqual([2])
    expect(queryJsonPath(data, '$.missing.x')).toEqual([])
  })
})
