// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import rimworld from '~/lib/adapters/builtin/rimworld.json'
import generic from '~/lib/adapters/builtin/generic.json'
import stellaris from '~/lib/adapters/builtin/stellaris.json'
import { detectGameVersion, detectItemVersions, expandTemplate, extractVersions, isCompatible, safeFileName, validateDefinition } from '~/lib/adapters/engine'
import type { AdapterDefinition, ExtractContext, FileContent } from '~/types/adapters'

// In-memory file system: { root: { relativePath: content } }. Globs are matched literally
// except for a trailing "*.ext" wildcard, which is all these tests need.
function ctx(files: Record<string, Record<string, string>>, extra: Partial<ExtractContext> = {}): ExtractContext {
  return {
    tags: [],
    readFiles: async (root: string, globs: string[]): Promise<FileContent[]> => {
      const tree = files[root] ?? {}
      return globs.flatMap((glob) => {
        const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`, 'i')
        return Object.entries(tree).filter(([p]) => re.test(p)).map(([path, content]) => ({ path, content, truncated: false }))
      })
    },
    ...extra
  }
}

describe('tags extractor', () => {
  it('collects capture groups from matching tags', async () => {
    const versions = await extractVersions([{ source: 'tags', regex: '^(\\d+\\.\\d+)$' }], ctx({}, { tags: ['Mod', '1.4', '1.5', '1.5'] }), 'item')
    expect(versions).toEqual(['1.4', '1.5'])
  })

  it('uses the whole match without a group', async () => {
    expect(await extractVersions([{ source: 'tags', regex: 'v\\d+' }], ctx({}, { tags: ['v2'] }), 'item')).toEqual(['v2'])
  })

  it('ignores invalid regexes', async () => {
    expect(await extractVersions([{ source: 'tags', regex: '(' }], ctx({}, { tags: ['1'] }), 'item')).toEqual([])
  })
})

describe('file extractor', () => {
  const files = {
    '/snap': {
      'About/About.xml': '<ModMetaData><supportedVersions><li>1.4</li><li>1.5</li></supportedVersions></ModMetaData>',
      'mod.json': '{"game": {"versions": ["2.0", "2.1"]}}',
      'broken.json': '{nope',
      'version.txt': 'Requires game 3.2.1 or newer',
      'descriptor.mod': 'name="Sample Mod"\ntags={\n "Utilities",\n "Gameplay"\n}\nsupported_version="v4.5.*"\n'
    },
    '/game': { 'Version.txt': '1.5.4104 rev435\n' }
  }

  it('reads xpath values', async () => {
    const versions = await extractVersions([{ source: 'file', glob: 'about/about.xml', xpath: '//supportedVersions/li' }], ctx(files, { itemRoot: '/snap' }), 'item')
    expect(versions).toEqual(['1.4', '1.5'])
  })

  it('reads json paths and flattens arrays', async () => {
    const versions = await extractVersions([{ source: 'file', glob: '*.json', jsonPath: '$.game.versions' }], ctx(files, { itemRoot: '/snap' }), 'item')
    expect(versions).toEqual(['2.0', '2.1'])
  })

  it('applies a regex to the whole file', async () => {
    const versions = await extractVersions([{ source: 'file', glob: 'version.txt', regex: 'game (\\d+\\.\\d+)' }], ctx(files, { itemRoot: '/snap' }), 'item')
    expect(versions).toEqual(['3.2'])
  })

  it('post-processes xpath results with regex', async () => {
    const versions = await extractVersions([{ source: 'file', glob: 'About/About.xml', xpath: '//li', regex: '^1\\.(\\d)$' }], ctx(files, { itemRoot: '/snap' }), 'item')
    expect(versions).toEqual(['4', '5'])
  })

  it('reads EnvExt fields and post-processes them with regex', async () => {
    const rule = { source: 'file' as const, glob: 'descriptor.mod', envExt: 'supported_version', regex: '^v?(\\d+\\.\\d+)' }
    expect(await extractVersions([rule], ctx(files, { itemRoot: '/snap' }), 'item')).toEqual(['4.5'])
    const tags = await extractVersions([{ source: 'file', glob: 'descriptor.mod', envExt: 'tags' }], ctx(files, { itemRoot: '/snap' }), 'item')
    expect(tags).toEqual(['Utilities', 'Gameplay'])
  })

  it('returns nothing without a root or on unreadable files', async () => {
    expect(await extractVersions([{ source: 'file', glob: 'x', regex: '.' }], ctx(files), 'item')).toEqual([])
    const failing: ExtractContext = { tags: [], itemRoot: '/snap', readFiles: async () => {
      throw new Error('denied')
    } }
    expect(await extractVersions([{ source: 'file', glob: 'x', regex: '.' }], failing, 'item')).toEqual([])
  })
})

describe('buildid extractor and rule order', () => {
  it('returns the buildid', async () => {
    expect(await extractVersions([{ source: 'buildid' }], ctx({}, { buildId: '15500000' }), 'game')).toEqual(['15500000'])
  })

  it('falls through to the next rule when one finds nothing', async () => {
    const versions = await extractVersions(
      [{ source: 'file', glob: 'missing.xml', xpath: '//x' }, { source: 'tags', regex: '^(\\d+\\.\\d+)$' }],
      ctx({ '/snap': {} }, { itemRoot: '/snap', tags: ['1.3'] }),
      'item'
    )
    expect(versions).toEqual(['1.3'])
  })
})

describe('built-in adapters', () => {
  const rw = rimworld as AdapterDefinition

  it('rimworld reads the game version from {install}/Version.txt', async () => {
    expect(await detectGameVersion(rw, ctx({ '/game': { 'Version.txt': '1.5.4104 rev435' } }, { installPath: '/game' }))).toBe('1.5')
  })

  it('rimworld reads item versions from About.xml, then tags', async () => {
    const about = '<ModMetaData><supportedVersions><li>1.5</li></supportedVersions></ModMetaData>'
    expect(await detectItemVersions(rw, ctx({ '/snap': { 'About/About.xml': about } }, { itemRoot: '/snap', tags: ['1.4'] }))).toEqual(['1.5'])
    expect(await detectItemVersions(rw, ctx({}, { tags: ['Mod', '1.4'] }))).toEqual(['1.4'])
  })

  it('stellaris reads supported_version from descriptor.mod', async () => {
    const descriptor = 'name="Mod"\ntags={\n "Utilities"\n}\nsupported_version="v4.5.*"\n'
    expect(await detectItemVersions(stellaris as AdapterDefinition, ctx({ '/snap': { 'descriptor.mod': descriptor } }, { itemRoot: '/snap' }))).toEqual(['v4.5.*'])
  })

  it('built-in definitions are valid', () => {
    expect(validateDefinition(rimworld)).toEqual([])
    expect(validateDefinition(generic)).toEqual([])
    expect(validateDefinition(stellaris)).toEqual([])
  })
})

describe('helpers', () => {
  it('checks compatibility by dotted prefix', () => {
    expect(isCompatible('1.5.4104', ['1.4', '1.5'])).toBe(true)
    expect(isCompatible('1.5', ['1.4'])).toBe(false)
    expect(isCompatible('1.5', ['1.50'])).toBe(false)
    expect(isCompatible(null, ['1.5'])).toBeNull()
    expect(isCompatible('1.5', [])).toBeNull()
  })

  it('expands templates and refuses missing values', () => {
    expect(expandTemplate('{install}/Mods', { install: 'C:/Games/RimWorld' })).toBe('C:/Games/RimWorld/Mods')
    expect(expandTemplate('{install}/Mods', { install: null })).toBeNull()
    expect(expandTemplate('{itemId} - {title}', { itemId: '1', title: 'A: B?' })).toBe('1 - A_ B_')
  })

  it('makes Windows-safe file names', () => {
    expect(safeFileName('a/b\\c<d>.')).toBe('a_b_c_d_')
    expect(safeFileName('...')).toBe('_')
  })

  it('validates definitions', () => {
    expect(validateDefinition({ id: 'bad id', name: '', itemVersions: [{ source: 'tags' }, { source: 'file' }, { source: 'nope' }] })).toEqual([
      'id is required (letters, digits, - and _)',
      'name is required',
      'itemVersions[0]: tags rules need a regex',
      'itemVersions[1]: file rules need a glob or path',
      'itemVersions[2].source must be tags, file or buildid'
    ])
    expect(validateDefinition({ id: 'x', name: 'X', itemVersions: [{ source: 'file', glob: 'descriptor.mod', envExt: ' ' }] })).toEqual([
      'itemVersions[0]: EnvExt rules need a field'
    ])
  })
})
