<script setup lang="ts">
import type { ImportCandidate } from '~/types/mods'

// A folder that can be imported: checkbox, item preview, and its result once imported.
defineProps<{
  candidate: ImportCandidate
  chosen: boolean
  disabled: boolean
  /** Imported (successfully or not). */
  done: boolean
  error: string | null
}>()
const emit = defineEmits<{ toggle: [on: boolean | 'indeterminate'] }>()
</script>

<template>
  <li class="flex items-center gap-3 p-2">
    <UCheckbox
      :model-value="chosen"
      :disabled="disabled"
      @update:model-value="emit('toggle', $event)"
    />
    <WorkshopItemTooltip
      :item-id="candidate.itemId"
      :details="candidate.details"
      class="flex flex-1 items-center gap-3"
    >
      <WorkshopItemThumbnail
        :src="candidate.details?.previewUrl"
        :placeholder="false"
        class="size-9 rounded"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm">
          {{ candidate.details?.title || candidate.itemId }}
        </p>
        <p class="text-xs text-muted">
          {{ candidate.itemId }} · {{ formatBytes(candidate.details?.fileSize ?? 0) }}
          <template v-if="candidate.details && candidate.timeUpdated < candidate.details.timeUpdated">
            · older than Steam's latest
          </template>
        </p>
        <p
          v-if="error"
          class="text-xs text-error"
        >
          {{ error }}
        </p>
      </div>
    </WorkshopItemTooltip>
    <UIcon
      v-if="done"
      :name="error ? 'i-lucide-circle-x' : 'i-lucide-circle-check'"
      :class="error ? 'text-error' : 'text-success'"
      class="size-5"
    />
  </li>
</template>
