<script setup lang="ts">
// Actions for the items ticked in a game's item table.
defineProps<{ count: number }>()
const emit = defineEmits<{ download: [], link: [], unlink: [], remove: [] }>()
</script>

<template>
  <div
    v-if="count"
    class="flex flex-wrap gap-2"
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
