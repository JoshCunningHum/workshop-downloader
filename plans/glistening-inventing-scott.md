# EnvExt extractor for adapter file rules

## Context

Stellaris (and other Paradox games) describe each workshop item in a `descriptor.mod` text file:

```
version="1.0"
tags={
 "Utilities",
 "Gameplay"
}
name="Sample Mode"
supported_version="v4.5.*"
remote_file_id="2347202203"
```

It's `.env`-like `key=value`, plus `{ ... }` blocks for multi-value fields. Adapter file rules can
currently extract with Regex, JSON path, XPath or the whole file; pulling `supported_version` or the
`tags` list out with a regex is fiddly and breaks on multi-line blocks. Add an **EnvExt** extractor:
the user names a **field** and gets its value(s), with `{}` lists expanded into separate values.

## Approach

### 1. Parser: `app/adapters/envExt.ts` (new, mirrors `app/adapters/jsonPath.ts`)

- `parseEnvExt(text): EnvExtBlock` — small tokenizer + recursive parser, tolerant of malformed input
  (never throws; an unclosed `{` just ends the block).
  - Tokens: `=`, `{`, `}`, quoted strings (`"..."` with `\"` / `\\` escapes), bare words (numbers,
    unquoted values). Whitespace and commas separate values (Paradox uses whitespace; the sample uses
    commas). `#` starts a comment to end of line, outside quotes.
  - `key = value` and `key = { ... }` are assignments. A `{}` block holding assignments becomes a
    nested block; one holding bare values becomes a list; a mix keeps both.
  - Repeated keys accumulate (Paradox files repeat keys such as `dependencies`).
- `queryEnvExt(text, field): string[]` — `field` is a key, or a dotted path (`a.b`) into nested
  blocks. Returns every value as a trimmed string: a scalar gives one value, a list gives each
  element, repeated keys give all of them; nested blocks themselves give nothing. Keys match exactly.

### 2. Engine and types

- `app/adapters/types.ts`: add `envExt?: string` to the `file` rule (the field to read), next to
  `regex` / `jsonPath` / `xpath`; update the "exactly one of these" comment.
- `app/adapters/engine.ts` `fromFile()`: add `else if (rule.envExt) values = queryEnvExt(content, rule.envExt)`
  before the regex branch, so the existing optional **then-regex** post-processing applies (e.g.
  `^v?(\d+\.\d+)` turns `v4.5.*` into `4.5`, which `isCompatible` can match against `4.5.x`).
- `validateDefinition()`: a file rule with `envExt` present must name a non-empty field.

### 3. Rule editor: `app/components/RuleListEditor.vue`

- Add `{ label: 'EnvExt (key = value)', value: 'envExt' }` to `pickers`; extend the `Picker` and
  `Loose` types with `envExt`.
- `picker()` / `setPicker()`: recognise and clear `envExt` like `xpath` / `jsonPath`.
- Reuse the expression input: label **Field**, placeholder `supported_version`; `exprValue` /
  `setExprValue` read and write `envExt`.
- The "Then regex (optional)" field shows for EnvExt as it does for XPath / JSON path.
- File placeholder stays as is; `descriptor.mod` goes in the glob field like any other file.

### Out of scope

No built-in Stellaris adapter (its game-version source isn't settled); users create one in the
adapter editor with glob `descriptor.mod`, EnvExt field `supported_version`, then regex `^v?(\d+\.\d+)`.

## Files

- New: `app/adapters/envExt.ts`, `test/envExt.test.ts`
- Changed: `app/adapters/types.ts`, `app/adapters/engine.ts`, `app/components/RuleListEditor.vue`,
  `test/engine.test.ts`

## Tests (own commit, per repo convention)

- `test/envExt.test.ts`: the sample above (`name`, `supported_version`, `tags` → 2 values,
  `remote_file_id`); unquoted values; whitespace-separated lists (no commas); `#` comments, including
  `#` inside quotes; escaped quotes; repeated keys; dotted path into a nested block; missing field → `[]`;
  malformed input (unclosed `{`, stray `}`) doesn't throw.
- `test/engine.test.ts`: a `file` rule with `glob: 'descriptor.mod'`, `envExt: 'supported_version'`,
  `regex: '^v?(\\d+\\.\\d+)'` → `['4.5']`; `validateDefinition` flags an empty `envExt`.

## Verification

- `bunx vitest run` (queued for the user; the sandbox can't read `node_modules/js-tokens`), plus
  `bun run typecheck` and `bun run lint` — expect only the 5 existing errors.
- Manual: Adapters → New adapter → Item versions → File rule, glob `descriptor.mod`, Extract with
  **EnvExt**, Field `supported_version`, then regex `^v?(\d+\.\d+)`; in the Test card pick a Stellaris
  item with a snapshot → "Detect item versions" shows `4.5`. Field `tags` returns both tags.
