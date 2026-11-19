<script setup lang="ts">
import type { ExtractRule } from '~/types/adapters'

// Edits an ordered list of extractor rules. The first rule that yields a value wins.
const props = defineProps<{ target: 'item' | 'game' }>()
const rules = defineModel<ExtractRule[]>({ default: () => [] })

type Picker = 'regex' | 'jsonPath' | 'xpath' | 'envExt' | 'whole'
type Loose = { source: ExtractRule['source'], glob?: string, path?: string, regex?: string, jsonPath?: string, xpath?: string, envExt?: string }

const sources = [
  { label: 'Workshop tags', value: 'tags' },
  { label: 'File', value: 'file' },
  { label: 'Installed buildid', value: 'buildid' }
]
const pickers = [
  { label: 'Regex', value: 'regex' },
  { label: 'JSON path', value: 'jsonPath' },
  { label: 'XPath', value: 'xpath' },
  { label: 'EnvExt (key = value)', value: 'envExt' },
  { label: 'Whole file', value: 'whole' }
]

const REGEX_PLACEHOLDER = '^(\\d+\\.\\d+)'
const loose = (i: number) => rules.value[i] as Loose
const filePlaceholder = computed(() => props.target === 'item' ? 'About/About.xml' : '{install}/Version.txt')
const fileKey = computed(() => props.target === 'item' ? 'glob' : 'path')

function update(i: number, patch: Partial<Loose>) {
  const next = [...rules.value]
  // Drop empty fields so the stored JSON stays clean.
  const merged = Object.fromEntries(Object.entries({ ...loose(i), ...patch }).filter(([, value]) => value !== '')) as Loose
  next[i] = merged as ExtractRule
  rules.value = next
}

function setSource(i: number, value: unknown) {
  const source = value as ExtractRule['source']
  const next = [...rules.value]
  if (source === 'tags') next[i] = { source, regex: '' }
  else if (source === 'file') next[i] = fileKey.value === 'glob' ? { source, glob: '', regex: '' } : { source, path: '', regex: '' }
  else next[i] = { source }
  rules.value = next
}

function picker(i: number): Picker {
  const r = loose(i)
  if (r.xpath !== undefined) return 'xpath'
  if (r.envExt !== undefined) return 'envExt'
  if (r.jsonPath !== undefined) return 'jsonPath'
  if (r.regex !== undefined) return 'regex'
  return 'whole'
}

function setPicker(i: number, picked: unknown) {
  const value = picked as Picker
  const r = { ...loose(i) }
  delete r.xpath
  delete r.jsonPath
  delete r.envExt
  delete r.regex
  if (value !== 'whole') r[value] = ''
  const next = [...rules.value]
  next[i] = r as ExtractRule
  rules.value = next
}

// Value of the file path field (glob for items, path for the game) and of the xpath/jsonPath/envExt field.
const fileValue = (i: number) => loose(i)[fileKey.value] ?? ''
const setFileValue = (i: number, value: unknown) => update(i, fileKey.value === 'glob' ? { glob: String(value) } : { path: String(value) })

type ExprPicker = 'xpath' | 'jsonPath' | 'envExt'
const EXPR: Record<ExprPicker, { label: string, placeholder: string }> = {
  xpath: { label: 'XPath', placeholder: '//supportedVersions/li' },
  jsonPath: { label: 'JSON path', placeholder: '$.version' },
  envExt: { label: 'Field', placeholder: 'supported_version' }
}
const exprPicker = (i: number) => picker(i) as ExprPicker
const hasExpr = (i: number) => picker(i) in EXPR
const exprValue = (i: number) => loose(i)[exprPicker(i)] ?? ''
const setExprValue = (i: number, value: unknown) => update(i, { [exprPicker(i)]: String(value) })

function regexLabel(i: number) {
  const r = loose(i)
  if (r.source === 'tags') return 'Regex (group 1 = version)'
  if (r.source === 'file' && picker(i) !== 'regex') return 'Then regex (optional)'
  return r.source === 'file' ? 'Regex (group 1 = version)' : 'Regex (optional)'
}

function move(i: number, by: number) {
  const next = [...rules.value]
  const [rule] = next.splice(i, 1)
  next.splice(i + by, 0, rule!)
  rules.value = next
}

function removeRule(i: number) {
  rules.value = rules.value.filter((_, j) => j !== i)
}

function add() {
  rules.value = [...rules.value, props.target === 'item' ? { source: 'tags', regex: '' } : { source: 'buildid' }]
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="(rule, i) in rules"
      :key="i"
      class="flex flex-wrap items-end gap-2 rounded-md border border-default p-2"
    >
      <UFormField label="Source">
        <USelect
          :model-value="rule.source"
          :items="sources"
          class="w-40"
          @update:model-value="setSource(i, $event)"
        />
      </UFormField>

      <template v-if="rule.source === 'file'">
        <UFormField :label="target === 'item' ? 'Glob (in snapshot)' : 'Path (in install folder)'">
          <UInput
            :model-value="fileValue(i)"
            :placeholder="filePlaceholder"
            @update:model-value="setFileValue(i, $event)"
          />
        </UFormField>
        <UFormField label="Extract with">
          <USelect
            :model-value="picker(i)"
            :items="pickers"
            class="w-36"
            @update:model-value="setPicker(i, $event)"
          />
        </UFormField>
        <UFormField
          v-if="hasExpr(i)"
          :label="EXPR[exprPicker(i)].label"
        >
          <UInput
            :model-value="exprValue(i)"
            :placeholder="EXPR[exprPicker(i)].placeholder"
            @update:model-value="setExprValue(i, $event)"
          />
        </UFormField>
      </template>

      <UFormField
        v-if="rule.source !== 'file' || picker(i) !== 'whole'"
        :label="regexLabel(i)"
      >
        <UInput
          :model-value="loose(i).regex"
          :placeholder="REGEX_PLACEHOLDER"
          @update:model-value="update(i, { regex: String($event) })"
        />
      </UFormField>

      <div class="ms-auto flex gap-1">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-up"
          :disabled="i === 0"
          @click="move(i, -1)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-down"
          :disabled="i === rules.length - 1"
          @click="move(i, 1)"
        />
        <UButton
          size="xs"
          color="error"
          variant="ghost"
          icon="i-lucide-x"
          @click="removeRule(i)"
        />
      </div>
    </div>
    <UButton
      size="xs"
      color="neutral"
      variant="outline"
      icon="i-lucide-plus"
      label="Add rule"
      @click="add"
    />
  </div>
</template>
