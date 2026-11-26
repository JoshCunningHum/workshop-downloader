<script setup lang="ts">
// Actions for the items ticked in a game's item table, shown in the game bar's row. They always
// take their space (the buttons are only hidden), so ticking the first item doesn't shift the row.
// `anyLocked`: at least one ticked item is locked, so the lock button offers to unlock.
defineProps<{ count: number, anyLocked: boolean }>()
const emit = defineEmits<{ 'download': [], 'link': [], 'unlink': [], 'lock': [on: boolean], 'delete-duplicates': [], 'remove': [] }>()
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
      color="neutral"
      variant="outline"
      :icon="anyLocked ? 'i-lucide-lock-open' : 'i-lucide-lock'"
      :label="anyLocked ? 'Unlock' : 'Lock'"
      :title="anyLocked
        ? 'Follow updates again'
        : 'Stay at this version: auto-update skips it and new downloads aren\'t made active'"
      @click="emit('lock', !anyLocked)"
    />
    <UButton
      size="sm"
      color="neutral"
      variant="outline"
      icon="i-lucide-copy-x"
      label="Delete duplicates"
      title="Keep only the active (or newest) snapshot of each selected item"
      @click="emit('delete-duplicates')"
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
