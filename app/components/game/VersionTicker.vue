<script setup lang="ts">
// Version text in a fixed-width box, the same for every row: a string that is too long pans
// back and forth (pausing a moment at each end) so all of it stays readable. The `aside`
// slot (the "(latest)" tag) sits still beside the panning area, inside the same width.
const pane = useTemplateRef<HTMLElement>('pane')
const text = useTemplateRef<HTMLElement>('text')
const overflow = ref(0)
useResizeObserver([pane, text], () => {
  overflow.value = Math.max(0, (text.value?.scrollWidth ?? 0) - (pane.value?.clientWidth ?? 0))
})
</script>

<template>
  <div class="flex w-48">
    <div
      ref="pane"
      class="min-w-0 flex-1 overflow-hidden"
    >
      <span
        ref="text"
        class="inline-block whitespace-nowrap"
        :style="overflow ? { 'animation': 'wsd-pan 7s ease-in-out infinite', '--wsd-pan': `-${overflow + 8}px` } : undefined"
      ><slot /></span>
    </div>
    <span class="ms-1 shrink-0 whitespace-nowrap"><slot name="aside" /></span>
  </div>
</template>
