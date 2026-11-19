<script setup lang="ts">
import type { AppRow } from '~/lib/db/schema'
import { ROUTES } from '~/constants/routes'

// A game's identity (AppID, game version, adapter; each detectable in place) over one compact
// row: search and the default slot (selection actions) on the left, the outdated-items update
// and icon actions on the right.
defineProps<{
  app: AppRow
  gameVersion: string | null
  adapterName?: string
  busy: boolean
  outdatedCount: number
  view: 'items' | 'settings' | 'history'
}>()
const search = defineModel<string>('search', { default: '' })
const emit = defineEmits<{
  'detect': []
  'detect-adapter': []
  'update-outdated': []
  'check-updates': []
  'verify-links': []
  'open-view': [view: 'items' | 'settings' | 'history']
}>()
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span
        v-if="!app.store"
        class="font-semibold text-highlighted"
      >{{ app.name ?? `App ${app.appId}` }}</span>
      <span class="text-dimmed tabular-nums">{{ app.appId }}</span>
      <span class="text-dimmed">·</span>
      <span>
        <span class="text-muted">game </span>
        <strong>{{ gameVersion ?? 'unknown' }}</strong>
        <span
          v-if="app.manualGameVersion"
          class="text-muted"
        > (manual)</span>
      </span>
      <UTooltip text="Detect the game version">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-scan-search"
          aria-label="Detect the game version"
          :loading="busy"
          @click="emit('detect')"
        />
      </UTooltip>
      <span class="text-dimmed">·</span>
      <UBadge
        :label="adapterName ?? 'no adapter'"
        icon="i-lucide-puzzle"
        color="neutral"
        variant="soft"
      />
      <UTooltip text="Pick the adapter that reads the most item versions">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-scan-search"
          aria-label="Detect the adapter"
          :loading="busy"
          @click="emit('detect-adapter')"
        />
      </UTooltip>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UInput
        v-if="view === 'items'"
        v-model="search"
        size="sm"
        icon="i-lucide-search"
        placeholder="Search items…"
        class="w-64"
      />
      <!-- Actions for ticked items (the item table's selection bar). -->
      <slot />

      <div class="ms-auto flex items-center gap-1">
        <UButton
          size="sm"
          icon="i-lucide-download"
          :label="outdatedCount ? `Update ${outdatedCount}` : 'Up to date'"
          :color="outdatedCount ? 'primary' : 'neutral'"
          :variant="outdatedCount ? 'solid' : 'ghost'"
          :disabled="!outdatedCount"
          :loading="busy"
          @click="emit('update-outdated')"
        />
        <UTooltip text="Check for updates">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            aria-label="Check for updates"
            :loading="busy"
            @click="emit('check-updates')"
          />
        </UTooltip>
        <UTooltip text="Browse the workshop">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-store"
            aria-label="Browse the workshop"
            :to="ROUTES.workshopApp(app.appId)"
          />
        </UTooltip>
        <UTooltip text="Verify links in the mods folder">
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-link"
            aria-label="Verify links"
            :loading="busy"
            @click="emit('verify-links')"
          />
        </UTooltip>
        <USeparator
          orientation="vertical"
          class="mx-1 h-5"
        />
        <UTooltip text="History and restore points">
          <UButton
            size="sm"
            color="neutral"
            :variant="view === 'history' ? 'soft' : 'ghost'"
            icon="i-lucide-history"
            aria-label="History"
            :aria-pressed="view === 'history'"
            @click="emit('open-view', view === 'history' ? 'items' : 'history')"
          />
        </UTooltip>
        <UTooltip text="Game settings">
          <UButton
            size="sm"
            color="neutral"
            :variant="view === 'settings' ? 'soft' : 'ghost'"
            icon="i-lucide-settings"
            aria-label="Game settings"
            :aria-pressed="view === 'settings'"
            @click="emit('open-view', view === 'settings' ? 'items' : 'settings')"
          />
        </UTooltip>
      </div>
    </div>
  </div>
</template>
