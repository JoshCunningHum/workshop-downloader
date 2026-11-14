// "EnvExt": the .env-like key/value format of Paradox files such as Stellaris' descriptor.mod.
//
//   name="Sample Mod"            # quoted or bare values, # comments
//   supported_version="v4.5.*"
//   tags={ "Utilities", "Gameplay" }   # a {} list: separated by whitespace and/or commas
//   settings={ mode=easy }       # a {} block of assignments: reached with a dotted field, "settings.mode"
//
// Repeated keys keep every value. Malformed input never throws: an unclosed { ends at the file end.

export type EnvExtValue = string | EnvExtBlock

export interface EnvExtBlock {
  /** Values assigned to each key, in file order. */
  fields: Map<string, EnvExtValue[]>
  /** Bare values in the block, i.e. list items. */
  items: string[]
}

type Token = { kind: '=' } | { kind: '{' } | { kind: '}' } | { kind: 'value', text: string }

const BARE_END = /[\s,={}"#]/

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (/\s/.test(c) || c === ',') {
      i++
    } else if (c === '#') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '=' || c === '{' || c === '}') {
      tokens.push({ kind: c })
      i++
    } else if (c === '"') {
      let value = ''
      i++
      while (i < text.length && text[i] !== '"') {
        // \" and \\ are escapes; other backslashes (Windows paths) are kept as written.
        if (text[i] === '\\' && (text[i + 1] === '"' || text[i + 1] === '\\')) i++
        value += text[i]
        i++
      }
      i++ // closing quote (past the end if unclosed)
      tokens.push({ kind: 'value', text: value })
    } else {
      let value = ''
      while (i < text.length && !BARE_END.test(text[i]!)) value += text[i++]
      tokens.push({ kind: 'value', text: value })
    }
  }
  return tokens
}

function newBlock(): EnvExtBlock {
  return { fields: new Map(), items: [] }
}

function addField(block: EnvExtBlock, key: string, value: EnvExtValue) {
  const values = block.fields.get(key)
  if (values) values.push(value)
  else block.fields.set(key, [value])
}

/** Parses tokens from `pos` until the matching `}` (or the end); returns the block and the next position. */
function parseBlock(tokens: Token[], pos: number, nested: boolean): [EnvExtBlock, number] {
  const block = newBlock()
  while (pos < tokens.length) {
    const token = tokens[pos]!
    if (token.kind === '}') {
      // Closes this block; a stray } at the top level is skipped.
      if (nested) return [block, pos + 1]
      pos++
    } else if (token.kind === '{') {
      // A block without a key has nothing to look it up by; skip over it.
      pos = parseBlock(tokens, pos + 1, true)[1]
    } else if (token.kind === '=') {
      pos++ // stray =
    } else if (tokens[pos + 1]?.kind === '=') {
      const value = tokens[pos + 2]
      if (value?.kind === '{') {
        const [child, next] = parseBlock(tokens, pos + 3, true)
        addField(block, token.text, child)
        pos = next
      } else if (value?.kind === 'value') {
        addField(block, token.text, value.text)
        pos += 3
      } else {
        pos += 2 // key = with nothing usable after it
      }
    } else {
      block.items.push(token.text)
      pos++
    }
  }
  return [block, pos]
}

export function parseEnvExt(text: string): EnvExtBlock {
  return parseBlock(tokenize(text), 0, false)[0]
}

/**
 * Values of `field` (a key, or a dotted path into nested blocks like "settings.mode").
 * A scalar gives one value, a {} list gives each item, a repeated key gives all of them.
 */
export function queryEnvExt(text: string, field: string): string[] {
  const path = field.trim().split('.').filter(Boolean)
  if (!path.length) return []
  let blocks = [parseEnvExt(text)]
  for (const key of path.slice(0, -1)) {
    blocks = blocks.flatMap(b => (b.fields.get(key) ?? []).filter((v): v is EnvExtBlock => typeof v !== 'string'))
  }
  const last = path[path.length - 1]!
  return blocks
    .flatMap(b => b.fields.get(last) ?? [])
    .flatMap(v => typeof v === 'string' ? [v] : v.items)
    .map(v => v.trim())
    .filter(Boolean)
}
