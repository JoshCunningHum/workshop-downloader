<script setup lang="ts">
import { EVENT_KINDS } from '~/constants/history'
import type { ItemRow, RestorePointRow, SnapshotEventRow, SnapshotRow } from '~/lib/db/schema'

// A compact list of link changes (and saved restore points) for tooltips: time, item, what
// happened, and the revision before -> after.
const props = withDefaults(defineProps<{
  events: SnapshotEventRow[]
  items: Map<string, ItemRow>
  snapshots: Map<number, SnapshotRow>
  points?: RestorePointRow[]
  title?: string
  max?: number
}>(), { points: () => [], title: undefined, max: 12 })

const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
function revision(id: number | null) {
  if (id === null) return 'not linked'
  const s = props.snapshots.get(id)
  return s ? formatTime(s.timeUpdated) : 'deleted snapshot'
}
const shown = computed(() => props.events.slice(0, props.max))
</script>

<template>
  <div class="w-80 space-y-1.5 text-xs">
    <p
      v-if="title"
      class="font-semibold text-highlighted"
    >
      {{ title }}
    </p>
    <div
      v-for="p in points"
      :key="`p${p.id}`"
      class="flex items-center gap-2"
    >
      <UIcon
        name="i-lucide-flag"
        class="size-3.5 shrink-0 text-error"
      />
      <span class="text-muted tabular-nums">{{ clock(p.createdAt) }}</span>
      <span class="truncate font-medium">{{ p.label || 'Saved restore point' }}</span>
    </div>
    <div
      v-for="e in shown"
      :key="e.id"
      class="flex gap-2"
    >
      <span
        class="mt-0.5 h-3 w-1 shrink-0 rounded-full"
        :class="EVENT_KINDS[e.kind].bar"
      />
      <span class="shrink-0 text-muted tabular-nums">{{ clock(e.at) }}</span>
      <span class="min-w-0">
        <span class="block truncate font-medium">{{ items.get(e.itemId)?.title || e.itemId }}</span>
        <span class="block truncate text-muted">{{ EVENT_KINDS[e.kind].label }} · {{ revision(e.fromSnapshotId) }} → {{ revision(e.toSnapshotId) }}</span>
      </span>
    </div>
    <p
      v-if="events.length > shown.length"
      class="text-muted"
    >
      +{{ events.length - shown.length }} more
    </p>
  </div>
</template>
