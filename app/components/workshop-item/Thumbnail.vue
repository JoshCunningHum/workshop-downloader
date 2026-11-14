<script setup lang="ts">
// A workshop item's preview image. Size and rounding come from the caller's class. Without an
// image a package icon stands in, unless `placeholder` is off (then nothing is rendered).
withDefaults(defineProps<{ src?: string | null, placeholder?: boolean }>(), { placeholder: true })
</script>

<template>
  <img
    v-if="src"
    :src="src"
    alt=""
    class="shrink-0 object-cover"
    loading="lazy"
  >
  <div
    v-else-if="placeholder"
    class="flex shrink-0 items-center justify-center bg-elevated"
  >
    <UIcon
      name="i-lucide-package"
      class="size-5 text-dimmed"
    />
  </div>
</template>
