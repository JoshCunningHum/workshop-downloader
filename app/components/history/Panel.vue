<script setup lang="ts">
import type { GamePage } from '~/composables/games/use-game-page'

// A game's history: a calendar of link changes beside the saved restore points, and a day's
// time ruler to restore from. "Save restore point" records the current links.
const props = defineProps<{ appId: number, page: GamePage }>()
const emit = defineEmits<{ back: [] }>()

const history = useRestorePoint(props.appId, props.page)
const {
  points, byDay, pointsByDay, day, dayEvents, dayPoints, range, point, items, snapshots,
  applicable, confirming, confirmPlan, confirmTitle, hold
} = history
onMounted(history.reload)

const attempt = useAttempt()
const saveOpen = ref(false)
const label = ref('')
const saving = ref(false)
async function save() {
  saving.value = true
  await attempt('Saving the restore point', () => history.savePoint(label.value))
  saving.value = false
  saveOpen.value = false
  label.value = ''
}
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
    <UPopover
      v-model:open="saveOpen"
      :content="{ align: 'end' }"
    >
      <UButton
        class="ms-auto"
        size="sm"
        icon="i-lucide-flag"
        label="Save restore point"
      />
      <template #content>
        <form
          class="w-80 space-y-3 p-4"
          @submit.prevent="save"
        >
          <div>
            <p class="text-sm font-medium text-highlighted">
              Save the current links
            </p>
            <p class="text-xs text-muted">
              Records the snapshot each item uses now. Those snapshots are kept until you delete the point.
            </p>
          </div>
          <UInput
            v-model="label"
            placeholder="Name (optional), e.g. Before new mods"
            class="w-full"
            autofocus
          />
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Cancel"
              @click="saveOpen = false"
            />
            <UButton
              type="submit"
              label="Save"
              :loading="saving"
            />
          </div>
        </form>
      </template>
    </UPopover>
  </div>

  <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
    <HistoryCalendar
      v-model="day"
      :by-day="byDay"
      :points-by-day="pointsByDay"
      :items="items"
      :snapshots="snapshots"
    />
    <HistorySavedPoints
      class="self-start"
      :points="points"
      :busy="page.busy.value"
      @restore="history.confirmSaved"
      @show="history.showPoint"
      @delete="(p) => attempt('Deleting the restore point', () => history.deletePoint(p))"
    />
  </div>

  <section class="rounded-md border border-default p-4">
    <UEmpty
      v-if="!range"
      icon="i-lucide-calendar-search"
      title="Pick a day"
      description="Days with bars had downloads or link changes; flags are saved restore points. Pick one to choose a moment to go back to."
    />
    <HistoryTimeline
      v-else
      v-model="point"
      :events="dayEvents"
      :points="dayPoints"
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
    :title="confirmTitle"
    :plan="confirmPlan"
    :items="items"
    :snapshots="snapshots"
    @confirm="history.restore"
  />
</template>
