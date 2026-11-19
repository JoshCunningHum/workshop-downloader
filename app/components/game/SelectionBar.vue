<script setup lang="ts">
// Actions for the items ticked in a game's item table, shown in the game bar's row. They always
// take their space (the buttons are only hidden), so ticking the first item doesn't shift the row.
defineProps<{ count: number }>()
const emit = defineEmits<{ download: [], link: [], unlink: [], remove: [] }>()
</script>

<template>
  <div
    class="flex gap-2 overflow-x-auto transition-opacity duration-150 *:shrink-0"
    :class="count ? 'opacity-100' : 'invisible opacity-0'"
    :aria-hidden="!count"
  >
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-lucide-download"
      :label="`Download ${count}`"
      @click="emit('download')"
    />
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-lucide-link"
      label="Link"
      @click="emit('link')"
    />
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-lucide-unlink"
      label="Unlink"
      @click="emit('unlink')"
    />
    <UButton
      size="sm"
      color="error"
      variant="outline"
      icon="i-lucide-trash-2"
      label="Remove"
      @click="emit('remove')"
    />
  </div>
</template>
