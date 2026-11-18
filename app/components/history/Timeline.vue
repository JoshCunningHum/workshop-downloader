<script setup lang="ts">
import { EVENT_KINDS } from '~/constants/history'
import type { ItemRow, SnapshotEventRow, SnapshotRow } from '~/lib/db/schema'

// One day's changes on a time track, with a slider for the moment to restore to.
const props = defineProps<{
  events: SnapshotEventRow[]
  range: { start: number, end: number }
  items: Map<string, ItemRow>
  snapshots: Map<number, SnapshotRow>
  changeCount: number
  busy: boolean
}>()
const point = defineModel<number>({ required: true })
const emit = defineEmits<{ restore: [] }>()

const left = (t: number) => `${((t - props.range.start) / (props.range.end - props.range.start)) * 100}%`
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

function revision(id: number | null) {
  if (id === null) return 'unlinked'
  const s = props.snapshots.get(id)
  return s ? formatTime(s.timeUpdated) : 'deleted snapshot'
}
const describe = (e: SnapshotEventRow) =>
  `${props.items.get(e.itemId)?.title || e.itemId} · ${EVENT_KINDS[e.kind].label} · ${revision(e.fromSnapshotId)} → ${revision(e.toSnapshotId)}`
</script>

<template>
  <div class="space-y-3">
    <div class="relative h-8 rounded-md bg-elevated">
      <!-- Changes after the chosen point are greyed out: they won't be applied. -->
      <div
        class="absolute inset-y-0 right-0 rounded-e-md bg-default/60"
        :style="{ left: left(point) }"
      />
      <UTooltip
        v-for="e in events"
        :key="e.id"
        :text="describe(e)"
      >
        <span
          class="absolute inset-y-1 w-1.5 -translate-x-1/2 rounded-full"
          :class="[EVENT_KINDS[e.kind].bar, e.at > point ? 'opacity-40' : '']"
          :style="{ left: left(e.at) }"
        />
      </UTooltip>
    </div>

    <USlider
      v-model="point"
      :min="range.start"
      :max="range.end"
      :step="60_000"
    />

    <div class="flex items-center justify-between text-xs text-muted">
      <span>{{ clock(range.start) }}</span>
      <span>{{ clock(range.end) }}</span>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <span class="text-sm">
        Restore to <strong>{{ formatMs(point) }}</strong>
        <span class="text-muted"> · {{ changeCount ? `${changeCount} item(s) would change` : 'matches the current state' }}</span>
      </span>
      <UButton
        class="ms-auto"
        icon="i-lucide-history"
        label="Restore to this point"
        :disabled="!changeCount"
        :loading="busy"
        @click="emit('restore')"
      />
    </div>
  </div>
</template>
