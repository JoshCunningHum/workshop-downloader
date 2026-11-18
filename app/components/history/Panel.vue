<script setup lang="ts">
import type { GamePage } from '~/composables/games/use-game-page'

// A game's history: a calendar of link changes, and a day's timeline to restore from.
const props = defineProps<{ appId: number, page: GamePage }>()
const emit = defineEmits<{ back: [] }>()

const history = useRestorePoint(props.appId, props.page)
const { byDay, day, dayEvents, range, point, items, snapshots, plan, applicable, confirming, hold } = history
onMounted(history.reload)
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      size="sm"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      aria-label="Back to items"
      @click="emit('back')"
    />
    <h2 class="font-semibold">
      History
    </h2>
  </div>

  <HistoryCalendar
    v-model="day"
    :by-day="byDay"
  />

  <section class="rounded-md border border-default p-4">
    <UEmpty
      v-if="!range"
      icon="i-lucide-calendar-search"
      title="Pick a day"
      description="Days with bars had downloads or link changes. Pick one to choose a moment to go back to."
    />
    <HistoryTimeline
      v-else
      v-model="point"
      :events="dayEvents"
      :range="range"
      :items="items"
      :snapshots="snapshots"
      :change-count="applicable.length"
      :busy="page.busy.value"
      @restore="confirming = true"
    />
  </section>

  <HistoryRestoreModal
    v-model:open="confirming"
    v-model:hold="hold"
    :point="point"
    :plan="plan"
    :items="items"
    :snapshots="snapshots"
    @confirm="history.restore"
  />
</template>
