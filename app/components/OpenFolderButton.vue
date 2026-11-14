<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import type { ButtonProps } from '@nuxt/ui'

// Shows a path in the system's default file manager (Explorer, Finder, Total Commander, ...).
// A file is revealed in its folder; a path that doesn't exist yet opens its closest parent.
const props = withDefaults(defineProps<{
  path: string | null | undefined
  size?: ButtonProps['size']
  variant?: ButtonProps['variant']
}>(), { size: 'sm', variant: 'outline' })

const attempt = useAttempt()

const open = () => attempt('Opening folder', () => invoke('open_in_file_manager', { path: props.path }))
</script>

<template>
  <UTooltip text="Open in file manager">
    <UButton
      :size="size"
      :variant="variant"
      color="neutral"
      icon="i-lucide-folder-open"
      aria-label="Open in file manager"
      :disabled="!path"
      @click.stop.prevent="open"
    />
  </UTooltip>
</template>
