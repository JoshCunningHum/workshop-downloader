<script setup lang="ts">
import { SPEED_BARS } from '~/composables/downloads/use-item-speed'

// An item's progress as Steam draws it, as the background of its row: bars fill left to right
// as it downloads, each as tall as the speed while that part came in. The caller positions it
// (e.g. absolute inset-0 behind the row's content); parts not downloaded yet stay clear.
const { bars = null, percent, faded = false } = defineProps<{
  /** Speed per bar, 0..1 of the fastest; null when there are no readings (bars fill flat). */
  bars?: number[] | null
  percent: number
  /** Not downloading any more: drawn fainter so finished rows stay calm. */
  faded?: boolean
}>()

const columns = computed(() => Array.from({ length: SPEED_BARS }, (_, i) => {
  // A bar is reached once the download gets into its slice.
  const reached = i / SPEED_BARS * 100 < percent
  // Without readings (e.g. downloaded before a restart) reached bars fill the row evenly.
  const height = !reached ? 0 : bars ? Math.max(8, Math.round((bars[i] ?? 0) * 100)) : 100
  return height
}))
</script>

<template>
  <div
    class="pointer-events-none flex items-end"
    :class="faded ? 'opacity-50' : undefined"
    role="progressbar"
    :aria-valuenow="percent"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      v-for="(height, i) in columns"
      :key="i"
      class="flex-1 transition-[height] duration-500"
      :class="height ? 'border-t-2 border-primary/50 bg-primary/10' : undefined"
      :style="{ height: `${height}%` }"
    />
  </div>
</template>
