<script setup lang="ts">
import { EVENT_KINDS } from '~/constants/history'
import type { ItemRow, RestorePointRow, SnapshotEventRow, SnapshotRow } from '~/lib/db/schema'

// One day's changes on a ruler: time ticks along both edges, a full-height bar per minute with
// changes (hover lists them), flags for saved restore points, and a red marker for the moment
// to restore to. Click or drag anywhere on the ruler to move it; as a slider it also takes arrow
// keys (1 min, Shift for 10), Home and End.
const props = defineProps<{
  events: SnapshotEventRow[]
  points: RestorePointRow[]
  range: { start: number, end: number }
  items: Map<string, ItemRow>
  snapshots: Map<number, SnapshotRow>
  changeCount: number
  busy: boolean
}>()
const point = defineModel<number>({ required: true })
const emit = defineEmits<{ restore: [] }>()

const MINUTE = 60_000
const span = computed(() => props.range.end - props.range.start)
const pct = (t: number) => `${((t - props.range.start) / span.value) * 100}%`
const clock = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

// Tick spacing that fits the range: about 60 minor ticks and 8 labelled ones at most.
const MINOR_STEPS = [1, 2, 5, 10, 15, 30, 60, 120].map(m => m * MINUTE)
const MAJOR_STEPS = [5, 10, 15, 30, 60, 120, 180, 360].map(m => m * MINUTE)
const ticks = computed(() => {
  const minor = MINOR_STEPS.find(s => span.value / s <= 60) ?? MINOR_STEPS.at(-1)!
  const major = MAJOR_STEPS.find(s => s >= minor * 2 && span.value / s <= 8) ?? MAJOR_STEPS.at(-1)!
  // Aligned to the local clock (10:00, 10:15, ...), not to the range's start.
  const offset = new Date(props.range.start).getTimezoneOffset() * MINUTE
  const first = Math.ceil((props.range.start - offset) / minor) * minor + offset
  const list: { t: number, major: boolean }[] = []
  for (let t = first; t <= props.range.end; t += minor) list.push({ t, major: (t - offset) % major === 0 })
  return list
})

// One bar per minute with changes, split into a segment per kind of change in it.
const bars = computed(() => byMinute(props.events).map(group => ({
  ...group,
  kinds: [...new Set(group.events.map(e => e.kind))]
})))

// --- Pointer and keyboard -------------------------------------------------------------------

const ruler = useTemplateRef<HTMLElement>('ruler')
const hover = ref<number | null>(null)
let dragging = false

const clamp = (t: number) => Math.min(props.range.end, Math.max(props.range.start, t))
/** The time under a pointer position, to the minute. */
function timeAt(clientX: number) {
  const rect = ruler.value!.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return clamp(Math.round((props.range.start + ratio * span.value) / MINUTE) * MINUTE)
}

function onDown(e: PointerEvent) {
  if (e.button !== 0) return
  dragging = true
  ruler.value!.setPointerCapture(e.pointerId)
  ruler.value!.focus()
  point.value = timeAt(e.clientX)
}
function onMove(e: PointerEvent) {
  const t = timeAt(e.clientX)
  hover.value = t
  if (dragging) point.value = t
}
function onUp(e: PointerEvent) {
  dragging = false
  ruler.value?.releasePointerCapture(e.pointerId)
}

function onKey(e: KeyboardEvent) {
  const step = (e.shiftKey ? 10 : 1) * MINUTE
  const moves: Record<string, () => number> = {
    ArrowLeft: () => point.value - step,
    ArrowDown: () => point.value - step,
    ArrowRight: () => point.value + step,
    ArrowUp: () => point.value + step,
    PageDown: () => point.value - 60 * MINUTE,
    PageUp: () => point.value + 60 * MINUTE,
    Home: () => props.range.start,
    End: () => props.range.end
  }
  const move = moves[e.key]
  if (!move) return
  e.preventDefault()
  point.value = clamp(move())
}
</script>

<template>
  <div class="space-y-4">
    <!-- py-3 leaves room for the marker's ends, which reach past the ruler. -->
    <div class="py-3">
      <div
        ref="ruler"
        role="slider"
        tabindex="0"
        aria-label="Point in time to restore to"
        :aria-valuemin="range.start"
        :aria-valuemax="range.end"
        :aria-valuenow="point"
        :aria-valuetext="clock(point)"
        class="relative h-24 cursor-crosshair touch-none rounded-md border border-accented bg-elevated select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
        @pointerleave="hover = null"
        @keydown="onKey"
      >
        <!-- After the chosen point: not applied by a restore. -->
        <div
          class="pointer-events-none absolute inset-y-0 right-0 rounded-e-md bg-default/50"
          :style="{ left: pct(point) }"
        />

        <!-- Ticks on both edges; labels under the long ones. -->
        <template
          v-for="tick in ticks"
          :key="tick.t"
        >
          <span
            class="pointer-events-none absolute top-0 w-px bg-(--ui-text-dimmed)"
            :class="tick.major ? 'h-5' : 'h-2'"
            :style="{ left: pct(tick.t) }"
          />
          <span
            class="pointer-events-none absolute bottom-0 w-px bg-(--ui-text-dimmed)"
            :class="tick.major ? 'h-4' : 'h-1.5'"
            :style="{ left: pct(tick.t) }"
          />
          <span
            v-if="tick.major"
            class="pointer-events-none absolute top-6 -translate-x-1/2 text-[11px] text-muted tabular-nums"
            :style="{ left: pct(tick.t) }"
          >{{ clock(tick.t) }}</span>
        </template>

        <!-- A full-height bar per minute with changes; hovering it lists just those. -->
        <UTooltip
          v-for="bar in bars"
          :key="bar.at"
          :delay-duration="100"
          :ui="{ content: 'h-auto px-3 py-2' }"
        >
          <span
            class="absolute inset-y-0 flex w-1.5 -translate-x-1/2 flex-col overflow-hidden rounded-sm opacity-80 hover:opacity-100"
            :class="bar.at > point ? 'opacity-30!' : ''"
            :style="{ left: pct(bar.at) }"
          >
            <span
              v-for="kind in bar.kinds"
              :key="kind"
              class="flex-1"
              :class="EVENT_KINDS[kind].bar"
            />
          </span>
          <template #content>
            <HistoryChangeList
              :title="`${bar.events.length} change(s) at ${clock(bar.at)}`"
              :events="bar.events"
              :items="items"
              :snapshots="snapshots"
            />
          </template>
        </UTooltip>

        <!-- Saved restore points: a flag at the top edge. -->
        <UTooltip
          v-for="p in points"
          :key="`p${p.id}`"
          :text="`${clock(p.createdAt)} · ${p.label || 'Saved restore point'}`"
        >
          <UIcon
            name="i-lucide-flag"
            class="absolute top-1 size-4 -translate-x-0.5 text-error"
            :style="{ left: pct(p.createdAt) }"
          />
        </UTooltip>

        <!-- Where a click would go. -->
        <div
          v-if="hover !== null && hover !== point"
          class="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-error/40"
          :style="{ left: pct(hover) }"
        >
          <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded bg-inverted px-1 text-[11px] text-inverted tabular-nums">{{ clock(hover) }}</span>
        </div>

        <!-- The chosen point: a red line reaching past both edges, with round ends. -->
        <div
          class="pointer-events-none absolute -inset-y-3 w-0.5 -translate-x-1/2 bg-error"
          :style="{ left: pct(point) }"
        >
          <span class="absolute -top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-error ring-2 ring-default" />
          <span class="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-error ring-2 ring-default" />
        </div>
      </div>
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
