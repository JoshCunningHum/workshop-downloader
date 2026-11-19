<script setup lang="ts">
import { EVENT_KINDS, MAX_DAY_BARS } from '~/constants/history'
import type { ItemRow, RestorePointRow, SnapshotEventRow, SnapshotRow } from '~/lib/db/schema'

// A month of a game's history: one bar per change in each day cell, a flag for saved restore
// points, and the day's changes in a tooltip. Picking a day selects it.
const props = defineProps<{
  byDay: Map<string, SnapshotEventRow[]>
  pointsByDay: Map<string, RestorePointRow[]>
  items: Map<string, ItemRow>
  snapshots: Map<number, SnapshotRow>
}>()
const day = defineModel<string | null>({ default: null })

// Opens on the month of the latest change (or this month).
const latest = computed(() => [...props.byDay.keys()].sort().at(-1))
const month = ref(startOfMonth(latest.value ? new Date(`${latest.value}T00:00`) : new Date()))
// Events load after mount: jump to the latest change's month once they arrive.
watch(latest, (key, before) => {
  if (key && !before) month.value = startOfMonth(new Date(`${key}T00:00`))
})
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function shift(by: number) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + by, 1)
}

const title = computed(() => month.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) =>
  new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })))

// Six weeks from the Sunday on or before the 1st.
const cells = computed(() => {
  const first = month.value
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const key = dayKey(date.getTime())
    return {
      key,
      date: date.getDate(),
      label: date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
      inMonth: date.getMonth() === first.getMonth(),
      events: props.byDay.get(key) ?? [],
      points: props.pointsByDay.get(key) ?? []
    }
  })
})
const today = dayKey(Date.now())
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-chevron-left"
        aria-label="Previous month"
        @click="shift(-1)"
      />
      <h3 class="w-40 text-center font-medium">
        {{ title }}
      </h3>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-chevron-right"
        aria-label="Next month"
        @click="shift(1)"
      />
      <div class="ms-auto flex flex-wrap gap-3 text-xs text-muted">
        <span
          v-for="(kind, name) in EVENT_KINDS"
          :key="name"
          class="flex items-center gap-1"
        >
          <span
            class="h-3 w-1.5 rounded-full"
            :class="kind.bar"
          />{{ kind.label }}
        </span>
      </div>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <div
        v-for="w in weekdays"
        :key="w"
        class="text-center text-xs text-muted"
      >
        {{ w }}
      </div>
      <UTooltip
        v-for="c in cells"
        :key="c.key"
        :disabled="!c.events.length && !c.points.length"
        :delay-duration="250"
        :ui="{ content: 'h-auto px-3 py-2' }"
      >
        <button
          :data-day="c.key"
          type="button"
          class="flex h-16 w-full flex-col gap-1 rounded-md border p-1.5 text-start text-xs transition-colors"
          :class="[
            c.key === day ? 'border-primary bg-primary/10' : 'border-default hover:bg-elevated',
            c.inMonth ? '' : 'opacity-40',
            c.events.length || c.points.length ? '' : 'text-dimmed'
          ]"
          :disabled="!c.events.length && !c.points.length"
          @click="day = c.key"
        >
          <span class="flex items-center gap-1">
            <span :class="c.key === today ? 'font-semibold text-primary' : ''">{{ c.date }}</span>
            <UIcon
              v-if="c.points.length"
              name="i-lucide-flag"
              class="ms-auto size-3.5 text-error"
            />
          </span>
          <span class="flex flex-wrap items-end gap-0.5">
            <span
              v-for="e in c.events.slice(0, MAX_DAY_BARS)"
              :key="e.id"
              class="h-4 w-1.5 rounded-full"
              :class="EVENT_KINDS[e.kind].bar"
            />
            <span
              v-if="c.events.length > MAX_DAY_BARS"
              class="text-muted"
            >+{{ c.events.length - MAX_DAY_BARS }}</span>
          </span>
        </button>
        <template #content>
          <HistoryChangeList
            :title="c.label"
            :events="c.events"
            :points="c.points"
            :items="items"
            :snapshots="snapshots"
          />
        </template>
      </UTooltip>
    </div>
  </div>
</template>
