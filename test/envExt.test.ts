import { describe, expect, it } from 'vitest'
import { parseEnvExt, queryEnvExt } from '~/adapters/envExt'

const descriptor = `version="1.0"
tags={
 "Utilities",
 "Gameplay"
}
name="Sample Mode"
supported_version="v4.5.*"
remote_file_id="2347202203"
`

describe('envExt', () => {
  it('reads scalars and lists from a descriptor.mod', () => {
    expect(queryEnvExt(descriptor, 'name')).toEqual(['Sample Mode'])
    expect(queryEnvExt(descriptor, 'supported_version')).toEqual(['v4.5.*'])
    expect(queryEnvExt(descriptor, 'remote_file_id')).toEqual(['2347202203'])
    expect(queryEnvExt(descriptor, 'tags')).toEqual(['Utilities', 'Gameplay'])
  })

  it('reads bare values and whitespace-separated lists', () => {
    const text = 'version = 2\ntags = { Utilities Gameplay "Quality of Life" }'
    expect(queryEnvExt(text, 'version')).toEqual(['2'])
    expect(queryEnvExt(text, 'tags')).toEqual(['Utilities', 'Gameplay', 'Quality of Life'])
  })

  it('skips comments but keeps # inside quotes', () => {
    const text = '# header\nname="Mod #1" # trailing\ntags={ "A" # one\n "B" }'
    expect(queryEnvExt(text, 'name')).toEqual(['Mod #1'])
    expect(queryEnvExt(text, 'tags')).toEqual(['A', 'B'])
  })

  it('unescapes quotes and keeps other backslashes', () => {
    const text = 'name="Say \\"hi\\""\npath="mod\\folder"'
    expect(queryEnvExt(text, 'name')).toEqual(['Say "hi"'])
    expect(queryEnvExt(text, 'path')).toEqual(['mod\\folder'])
  })

  it('keeps every value of a repeated key', () => {
    const text = 'dependencies={ "Core" }\ndependencies={ "UI Overhaul" }\nsupported_version="v3.*"\nsupported_version="v4.*"'
    expect(queryEnvExt(text, 'dependencies')).toEqual(['Core', 'UI Overhaul'])
    expect(queryEnvExt(text, 'supported_version')).toEqual(['v3.*', 'v4.*'])
  })

  it('follows dotted fields into nested blocks', () => {
    const text = 'settings={ mode=easy limits={ max=5 } }'
    expect(queryEnvExt(text, 'settings.mode')).toEqual(['easy'])
    expect(queryEnvExt(text, 'settings.limits.max')).toEqual(['5'])
    expect(queryEnvExt(text, 'settings')).toEqual([])
    expect(parseEnvExt(text).fields.get('settings')).toHaveLength(1)
  })

  it('returns nothing for missing or empty fields', () => {
    expect(queryEnvExt(descriptor, 'picture')).toEqual([])
    expect(queryEnvExt(descriptor, '')).toEqual([])
    expect(queryEnvExt(descriptor, 'name.inner')).toEqual([])
  })

  it('tolerates malformed input', () => {
    // An unclosed { swallows the rest of the file.
    expect(queryEnvExt('tags={ "A" "B"\nname="X"', 'tags')).toEqual(['A', 'B'])
    expect(queryEnvExt('tags={ "A" "B"\nname="X"', 'name')).toEqual([])
    expect(queryEnvExt('} name="X" =', 'name')).toEqual(['X'])
    expect(queryEnvExt('name=', 'name')).toEqual([])
    expect(queryEnvExt('name="unclosed', 'name')).toEqual(['unclosed'])
  })
})
