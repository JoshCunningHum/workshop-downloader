<script setup lang="ts">
// One setting: label and help on the left, its control on the right (stacked on narrow screens).
defineProps<{ label: string, description?: string, for?: string }>()
</script>

<template>
  <div class="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center md:gap-6">
    <div class="min-w-0">
      <label
        :for="$props.for"
        class="text-sm font-medium text-highlighted"
      >{{ label }}</label>
      <p
        v-if="description"
        class="text-xs text-muted"
      >
        {{ description }}
      </p>
    </div>
    <div class="flex min-w-0 items-center gap-2">
      <slot />
    </div>
  </div>
</template>
