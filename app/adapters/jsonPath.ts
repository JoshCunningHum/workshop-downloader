// Minimal JSON path: `$.a.b`, `a.b`, `$.list[0].x`, `$.list[*].x`, `$['key with space']`.
// Returns every matched value (wildcards fan out).

type Segment = string | number | '*'

export function parseJsonPath(path: string): Segment[] {
  const segments: Segment[] = []
  const re = /\.([^.[\]]+)|\[(\d+)\]|\[\*\]|\['([^']*)'\]|\["([^"]*)"\]|^([^.[\]$]+)/g
  const body = path.trim().replace(/^\$/, '')
  let consumed = 0
  for (const m of body.matchAll(re)) {
    if (m.index !== consumed) throw new Error(`Invalid JSON path: ${path}`)
    consumed = m.index + m[0].length
    if (m[0] === '[*]' || m[1] === '*') segments.push('*')
    else if (m[2] !== undefined) segments.push(Number(m[2]))
    else segments.push(m[1] ?? m[3] ?? m[4] ?? m[5]!)
  }
  if (consumed !== body.length) throw new Error(`Invalid JSON path: ${path}`)
  return segments
}

export function queryJsonPath(data: unknown, path: string): unknown[] {
  let current: unknown[] = [data]
  for (const segment of parseJsonPath(path)) {
    const next: unknown[] = []
    for (const value of current) {
      if (value === null || typeof value !== 'object') continue
      if (segment === '*') next.push(...Object.values(value))
      else if (segment in value) next.push((value as Record<string | number, unknown>)[segment])
    }
    current = next
  }
  return current.filter(v => v !== undefined)
}
