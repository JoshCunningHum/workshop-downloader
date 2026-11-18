<script setup lang="ts">
// A thin progress line for the Workshop browser. The webview only reports when a page starts and
// finishes, not how far along it is, so while loading the line creeps towards 90% (fast at first,
// then slower) and on finish it fills up and fades out.
const props = defineProps<{ loading: boolean }>()

const progress = ref(0)
const visible = ref(false)

const { pause, resume } = useIntervalFn(() => {
  progress.value += (0.9 - progress.value) * 0.08
}, 200, { immediate: false })

let fade: ReturnType<typeof setTimeout> | undefined

watch(() => props.loading, (loading) => {
  clearTimeout(fade)
  if (loading) {
    visible.value = true
    progress.value = 0.08
    resume()
  } else {
    pause()
    progress.value = 1
    fade = setTimeout(() => {
      visible.value = false
      // Reset once hidden, so the next load doesn't animate backwards.
      fade = setTimeout(() => progress.value = 0, 300)
    }, 250)
  }
}, { immediate: true })

onBeforeUnmount(() => clearTimeout(fade))
</script>

<template>
  <div
    class="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 transition-opacity duration-300"
    :class="visible ? 'opacity-100' : 'opacity-0'"
    role="progressbar"
    aria-label="Page loading"
    :aria-valuenow="Math.round(progress * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
  >
    <div
      class="h-full bg-primary transition-[width] duration-200 ease-out"
      :style="{ width: `${progress * 100}%` }"
    />
  </div>
</template>
