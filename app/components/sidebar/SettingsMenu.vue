<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// Quick settings beside the theme button. Items stay open after toggling (preventDefault on select).
const { settings, save } = useSettings()
const attempt = useAttempt()

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: 'Workshop' }],
  [{
    type: 'checkbox',
    label: 'Open Workshop item links in the Workshop browser',
    checked: settings.value.openItemLinksInWorkshop,
    onUpdateChecked: checked => attempt('Saving', () => save('openItemLinksInWorkshop', checked)),
    onSelect: e => e.preventDefault()
  }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ side: 'top', align: 'start' }"
    :ui="{ content: 'w-72' }"
  >
    <UButton
      icon="i-lucide-settings-2"
      color="neutral"
      variant="ghost"
      aria-label="Quick settings"
    />
  </UDropdownMenu>
</template>
