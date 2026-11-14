<script setup lang="ts">
import { ROUTES } from '~/constants/routes'
</script>

<template>
  <div class="flex flex-col">
    <SettingsSection
      title="Filesystem watcher"
      description="Tries the fswatch sidecar on a folder: a one-off size, then a live watch of its total size."
    >
      <UButton
        :to="ROUTES.fswatch"
        label="Filesystem watcher test"
        color="neutral"
        variant="outline"
        icon="i-lucide-activity"
      />
    </SettingsSection>
  </div>
</template>
