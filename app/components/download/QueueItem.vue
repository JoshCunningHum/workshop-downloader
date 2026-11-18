<script setup lang="ts">
import { ROUTES } from '~/constants/routes'
import type { QueueEntry } from '~/types/downloads'

// A queued item, laid out like a download row: tick it to include it in "Download".
// With `openable`, the title is a link-styled button that emits `open` (the Workshop browser
// shows the item's page) instead of plain text.
const props = defineProps<{ entry: QueueEntry, noDetails?: boolean, openable?: boolean }>()
const emit = defineEmits<{ toggle: [on: boolean | 'indeterminate'], remove: [], open: [] }>()

const item = computed(() => props.entry.details)
const status = computed(() => props.entry.downloaded
  ? { label: 'downloaded', color: 'success' as const }
  : props.entry.hasSnapshot
    ? { label: 'update', color: 'warning' as const }
    : { label: 'new', color: 'info' as const })
</script>

<template>
  <li class="flex items-center gap-3 py-2">
    <UCheckbox
      :model-value="entry.checked"
      @update:model-value="emit('toggle', $event)"
    />

    <WorkshopItemTooltip
      :item-id="item.id"
      :details="item"
      :disabled="noDetails"
      class="flex flex-1 items-center gap-3"
    >
      <WorkshopItemThumbnail
        :src="item.previewUrl"
        class="size-10 rounded"
      />

      <div class="min-w-0 flex-1 space-y-1">
        <div class="flex items-center gap-2">
          <button
            v-if="openable"
            type="button"
            class="cursor-pointer truncate text-start text-sm font-medium text-primary hover:underline"
            :title="`Open ${item.title || item.id} in the browser`"
            @click="emit('open')"
          >
            {{ item.title || item.id }}
          </button>
          <span
            v-else
            class="truncate text-sm font-medium"
          >{{ item.title || item.id }}</span>
          <NuxtLink
            :to="ROUTES.game(item.appId)"
            class="shrink-0 truncate text-xs text-muted hover:underline"
          >
            {{ entry.appName ?? `App ${item.appId}` }}
          </NuxtLink>
        </div>
        <div class="flex items-center gap-2 text-xs text-muted">
          <span class="flex-1 truncate">updated {{ formatTime(item.timeUpdated) }}</span>
          <span class="shrink-0 tabular-nums">{{ formatBytes(item.fileSize) }}</span>
        </div>
      </div>
    </WorkshopItemTooltip>

    <UBadge
      :color="status.color"
      variant="subtle"
      class="shrink-0"
    >
      {{ status.label }}
    </UBadge>

    <UTooltip text="Remove from queue">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-x"
        aria-label="Remove from queue"
        @click="emit('remove')"
      />
    </UTooltip>
  </li>
</template>
