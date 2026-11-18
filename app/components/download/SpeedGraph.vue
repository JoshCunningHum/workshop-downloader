<script setup lang="ts">
import { SPEED_BARS } from '~/composables/downloads/use-item-speed'

// An item's progress as Steam draws it: bars fill left to right as it downloads, each as tall
// as the speed while that part came in. Parts not downloaded yet are a dim track.
const { bars = null, percent } = defineProps<{
  /** Speed per bar, 0..1 of the fastest; null when there are no readings (all bars flat). */
  bars?: number[] | null
  percent: number
}>()

const columns = computed(() => Array.from({ length: SPEED_BARS }, (_, i) => {
  // A bar is reached once the download gets into its slice.
  const reached = i / SPEED_BARS * 100 < percent
  // Reached bars without a reading (e.g. finished before the first one) still show, low.
  const height = reached ? Math.max(15, Math.round((bars?.[i] ?? 0) * 100)) : 15
  return { reached, height }
}))
</script>

<template>
  <div
    class="flex h-6 items-end gap-px"
    role="progressbar"
    :aria-valuenow="percent"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      v-for="(bar, i) in columns"
      :key="i"
      class="flex-1 rounded-t-[1px] transition-[height] duration-500"
      :class="bar.reached ? 'bg-primary' : 'bg-accented'"
      :style="{ height: `${bar.height}%` }"
    />
  </div>
</template>
