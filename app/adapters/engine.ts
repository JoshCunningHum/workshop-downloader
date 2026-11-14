import type { AdapterDefinition, ExtractContext, ExtractRule, FileContent } from './types'
import { queryEnvExt } from './envExt'
import { queryJsonPath } from './jsonPath'

// Rules are tried in order; the first rule that yields any value wins.
export async function extractVersions(rules: ExtractRule[] | undefined, ctx: ExtractContext, target: 'item' | 'game'): Promise<string[]> {
  for (const rule of rules ?? []) {
    // A broken rule (bad xpath, unreadable file, ...) counts as "found nothing" so later rules still run.
    const values = dedupe(await applyRule(rule, ctx, target).catch(() => []))
    if (values.length) return values
  }
  return []
}

export async function detectGameVersion(adapter: AdapterDefinition, ctx: ExtractContext): Promise<string | null> {
  return (await extractVersions(adapter.gameVersion, ctx, 'game'))[0] ?? null
}

export function detectItemVersions(adapter: AdapterDefinition, ctx: ExtractContext): Promise<string[]> {
  return extractVersions(adapter.itemVersions, ctx, 'item')
}

async function applyRule(rule: ExtractRule, ctx: ExtractContext, target: 'item' | 'game'): Promise<string[]> {
  switch (rule.source) {
    case 'tags':
      return ctx.tags.flatMap(tag => matchAll(tag, rule.regex, false))
    case 'buildid':
      if (!ctx.buildId) return []
      return rule.regex ? matchAll(ctx.buildId, rule.regex, false) : [ctx.buildId]
    case 'file': {
      const root = target === 'item' ? ctx.itemRoot : ctx.installPath
      const glob = (rule.glob ?? rule.path ?? '').replace(/^\{install\}[\\/]/, '')
      if (!root || !glob) return []
      let files: FileContent[]
      try {
        files = await ctx.readFiles(root, [glob])
      } catch {
        return []
      }
      return files.flatMap(file => fromFile(file.content, rule))
    }
  }
}

function fromFile(content: string, rule: Extract<ExtractRule, { source: 'file' }>): string[] {
  let values: string[]
  if (rule.xpath) values = xpathValues(content, rule.xpath)
  else if (rule.jsonPath) values = jsonValues(content, rule.jsonPath)
  else if (rule.envExt) values = queryEnvExt(content, rule.envExt)
  else if (rule.regex) return matchAll(content, rule.regex, true)
  else return [content.trim()].filter(Boolean)
  return rule.regex ? values.flatMap(v => matchAll(v, rule.regex!, false)) : values
}

function xpathValues(content: string, xpath: string): string[] {
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return []
  const result = doc.evaluate(xpath, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
  const values: string[] = []
  for (let i = 0; i < result.snapshotLength; i++) {
    const text = result.snapshotItem(i)?.textContent?.trim()
    if (text) values.push(text)
  }
  return values
}

function jsonValues(content: string, path: string): string[] {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch {
    return []
  }
  return queryJsonPath(data, path).flatMap(v => Array.isArray(v) ? v : [v]).map(v => typeof v === 'string' ? v.trim() : JSON.stringify(v)).filter(Boolean)
}

/** Capture group 1 if the regex has one, else the whole match. `multiline` scans a whole file. */
function matchAll(text: string, pattern: string, multiline: boolean): string[] {
  let re: RegExp
  try {
    re = new RegExp(pattern, multiline ? 'gm' : 'g')
  } catch {
    return []
  }
  return [...text.matchAll(re)].map(m => (m[1] ?? m[0]).trim()).filter(Boolean)
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Whether an item that supports `itemVersions` fits game version `gameVersion`.
 * Versions match when equal or when one is a dotted prefix of the other ("1.5" fits "1.5.4104").
 * Returns null when either side is unknown.
 */
export function isCompatible(gameVersion: string | null | undefined, itemVersions: string[]): boolean | null {
  if (!gameVersion || !itemVersions.length) return null
  const fits = (a: string, b: string) => a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`)
  return itemVersions.some(v => fits(gameVersion, v))
}

/** Expands {install}, {appId}, {itemId}, {title} in adapter templates. */
export function expandTemplate(template: string, vars: Partial<Record<'install' | 'appId' | 'itemId' | 'title', string | number | null | undefined>>): string | null {
  let missing = false
  const out = template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name as keyof typeof vars]
    if (value === undefined || value === null || value === '') {
      missing = true
      return whole
    }
    return name === 'title' ? safeFileName(String(value)) : String(value)
  })
  return missing ? null : out
}

/** Strips characters Windows doesn't allow in file names. */
export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '').trim().slice(0, 120) || '_'
}

export function validateDefinition(value: unknown): string[] {
  const errors: string[] = []
  const def = value as Partial<AdapterDefinition>
  if (!def || typeof def !== 'object') return ['Definition must be a JSON object']
  if (!def.id || !/^[\w-]+$/.test(def.id)) errors.push('id is required (letters, digits, - and _)')
  if (!def.name) errors.push('name is required')
  if (def.appId !== null && def.appId !== undefined && !Number.isInteger(def.appId)) errors.push('appId must be a number or null')
  for (const key of ['gameVersion', 'itemVersions'] as const) {
    const rules = def[key]
    if (rules === undefined) continue
    if (!Array.isArray(rules)) {
      errors.push(`${key} must be an array`)
      continue
    }
    rules.forEach((rule, i) => {
      const where = `${key}[${i}]`
      if (!['tags', 'file', 'buildid'].includes(rule?.source)) errors.push(`${where}.source must be tags, file or buildid`)
      if (rule?.source === 'tags' && !rule.regex) errors.push(`${where}: tags rules need a regex`)
      if (rule?.source === 'file' && !rule.glob && !rule.path) errors.push(`${where}: file rules need a glob or path`)
      if (rule?.source === 'file' && rule.envExt !== undefined && !rule.envExt.trim()) errors.push(`${where}: EnvExt rules need a field`)
      const pattern = (rule as { regex?: string })?.regex
      if (pattern) {
        try {
          new RegExp(pattern)
        } catch {
          errors.push(`${where}.regex is not a valid regular expression`)
        }
      }
    })
  }
  return errors
}
