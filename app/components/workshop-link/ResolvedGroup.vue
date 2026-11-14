<script setup lang="ts">
import type { ItemDetails } from '~/types/steam'

// The resolved items of one game, each with a checkbox and its download state.
defineProps<{
  group: { appId: number, items: ItemDetails[] }
  appName?: string
  excluded: Set<string>
  latest: Map<string, number>
  isCurrent: (item: ItemDetails) => boolean
  downloadCount: number
  queuing: boolean
  canDownload: boolean
}>()
const emit = defineEmits<{ download: [], toggle: [id: string, on: boolean | 'indeterminate'] }>()
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <span class="font-medium">{{ appName ?? `App ${group.appId}` }}</span>
        <UBadge
          color="neutral"
          variant="subtle"
        >
          AppID {{ group.appId }}
        </UBadge>
        <UButton
          class="ms-auto"
          size="sm"
          icon="i-lucide-download"
          :label="`Download ${downloadCount}`"
          :loading="queuing"
          :disabled="!canDownload"
          @click="emit('download')"
        />
      </div>
    </template>
    <ul class="divide-y divide-default">
      <li
        v-for="item in group.items"
        :key="item.id"
        class="flex items-center gap-3 py-2"
      >
        <UCheckbox
          :model-value="!excluded.has(item.id)"
          @update:model-value="emit('toggle', item.id, $event)"
        />
        <WorkshopItemTooltip
          :item-id="item.id"
          :details="item"
          class="flex flex-1 items-center gap-3"
        >
          <WorkshopItemThumbnail
            :src="item.previewUrl"
            :placeholder="false"
            class="size-10 rounded"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate">
              {{ item.title || item.id }}
            </p>
            <p class="text-xs text-muted">
              {{ formatBytes(item.fileSize) }} · updated {{ formatTime(item.timeUpdated) }}
            </p>
          </div>
        </WorkshopItemTooltip>
        <UBadge
          v-if="isCurrent(item)"
          color="success"
          variant="subtle"
        >
          downloaded
        </UBadge>
        <UBadge
          v-else-if="latest.has(item.id)"
          color="warning"
          variant="subtle"
        >
          update
        </UBadge>
      </li>
    </ul>
  </UCard>
</template>
