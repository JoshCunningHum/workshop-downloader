<script setup lang="ts">
import { RESTORE_GROUPS } from '~/constants/history'
import type { ItemRow, SnapshotRow } from '~/lib/db/schema'
import type { RestoreChange } from '~/utils/restore-point'

// Confirms a restore: what changes per item, and whether to hold the changed items.
const props = defineProps<{
  point: number
  plan: RestoreChange[]
  items: Map<string, ItemRow>
  snapshots: Map<number, SnapshotRow>
}>()
const open = defineModel<boolean>('open', { default: false })
const hold = defineModel<boolean>('hold', { default: true })
const emit = defineEmits<{ confirm: [] }>()

const groups = computed(() => RESTORE_GROUPS
  .map(g => ({ ...g, changes: props.plan.filter(c => c.action === g.action) }))
  .filter(g => g.changes.length))
const applicable = computed(() => props.plan.filter(c => c.action !== 'missing').length)

function revision(id: number | null) {
  if (id === null) return 'not linked'
  const s = props.snapshots.get(id)
  return s ? formatTime(s.timeUpdated) : 'deleted'
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Restore to ${formatMs(point)}`"
    description="Links in the mods folder are switched back. No files are deleted."
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <section
          v-for="g in groups"
          :key="g.action"
          class="space-y-1"
        >
          <h3 class="text-sm font-medium">
            {{ g.title }} <span class="text-muted">({{ g.changes.length }})</span>
          </h3>
          <ul class="max-h-60 divide-y divide-default overflow-y-auto rounded-md border border-default text-sm">
            <li
              v-for="c in g.changes"
              :key="c.itemId"
              class="flex flex-wrap items-center gap-2 px-3 py-2"
              :class="g.action === 'missing' ? 'text-muted' : ''"
            >
              <span class="min-w-0 flex-1 truncate">{{ items.get(c.itemId)?.title || c.itemId }}</span>
              <span class="text-xs text-muted tabular-nums">
                {{ revision(c.from) }} → {{ revision(c.to) }}
              </span>
            </li>
          </ul>
        </section>

        <UCheckbox
          v-model="hold"
          label="Hold changed items at this version"
          description="Auto-update skips them, and new downloads are kept without being made active. Release the hold from the item table."
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          label="Cancel"
          @click="open = false"
        />
        <UButton
          icon="i-lucide-history"
          :label="`Restore ${applicable} item(s)`"
          :disabled="!applicable"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
