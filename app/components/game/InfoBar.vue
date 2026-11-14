<script setup lang="ts">
import type { AppRow } from '~/lib/db/schema'

// AppID, game version and adapter of a game, with its page-level actions.
defineProps<{
  app: AppRow
  gameVersion: string | null
  adapterName?: string
  busy: boolean
  canUpdate: boolean
  settingsOpen: boolean
}>()
const emit = defineEmits<{
  'detect': []
  'detect-adapter': []
  'update-outdated': []
  'check-updates': []
  'verify-links': []
  'open-settings': []
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 text-sm">
    <span class="text-dimmed">{{ app.appId }}</span>
    <span class="text-muted">·</span>
    <span>
      <strong>{{ gameVersion ?? 'unknown version' }}</strong>
      <span
        v-if="app.manualGameVersion"
        class="text-muted"
      > (manual)</span>
    </span>
    <UButton
      size="xs"
      color="neutral"
      variant="outline"
      icon="i-lucide-scan-search"
      label="Detect"
      :loading="busy"
      @click="emit('detect')"
    />
    <span class="text-muted">·</span>
    <UBadge :label="adapterName" icon="lucide:link-2" color="neutral" variant="soft" />
    <UButton
      size="xs"
      color="neutral"
      variant="outline"
      icon="i-lucide-scan-search"
      label="Detect"
      :loading="busy"
      @click="emit('detect-adapter')"
    />
    <div class="ms-auto flex flex-wrap gap-2">
      <UButton
        size="xs"
        icon="i-lucide-download"
        label="Update outdated"
        :disabled="!canUpdate"
        :loading="busy"
        @click="emit('update-outdated')"
      />
      <UButton
        size="xs"
        icon="i-lucide-refresh-cw"
        label="Check updates"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="emit('check-updates')"
      />
      <UButton
        size="xs"
        icon="i-lucide-link"
        label="Verify links"
        color="neutral"
        variant="outline"
        :loading="busy"
        @click="emit('verify-links')"
      />
      <UTooltip text="Game settings">
        <UButton
          size="xs"
          icon="i-lucide-settings"
          color="neutral"
          :variant="settingsOpen ? 'soft' : 'outline'"
          aria-label="Game settings"
          @click="emit('open-settings')"
        />
      </UTooltip>
    </div>
  </div>
</template>
