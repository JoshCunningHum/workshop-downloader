<script setup lang="ts">
import { isCompatible } from '~/lib/adapters/engine'
import type { SnapshotRow } from '~/lib/db/schema'

// The downloaded revisions of an item, with switch / pin / delete per revision.
defineProps<{
  snapshots: SnapshotRow[]
  activeId: number | null
  linked: boolean
  gameVersion: string | null
  busy: boolean
}>()
const emit = defineEmits<{
  'make-active': [id: number]
  'toggle-pin': [id: number, pinned: boolean]
  'remove': [id: number]
}>()
</script>

<template>
  <ul class="divide-y divide-default rounded-md border border-default">
    <li
      v-for="s in snapshots"
      :key="s.id"
      class="flex flex-wrap items-center gap-3 p-3"
    >
      <div class="min-w-0 flex-1">
        <p class="font-medium">
          Revision {{ formatTime(s.timeUpdated) }}
          <UBadge
            v-if="s.id === activeId"
            size="sm"
            color="primary"
            variant="subtle"
          >
            active
          </UBadge>
          <UBadge
            v-if="s.pinned"
            size="sm"
            color="neutral"
            variant="subtle"
          >
            pinned
          </UBadge>
        </p>
        <p class="text-xs text-muted">
          {{ formatBytes(s.sizeBytes) }} · downloaded {{ formatMs(s.downloadedAt) }}
          · versions {{ s.itemVersions.join(', ') || 'unknown' }}
          <template v-if="isCompatible(gameVersion, s.itemVersions) === false">
            · <span class="text-error">doesn't list {{ gameVersion }}</span>
          </template>
        </p>
        <p class="truncate text-xs text-dimmed">
          {{ s.path }}
        </p>
      </div>
      <OpenFolderButton
        :path="s.path"
        size="xs"
      />
      <UButton
        v-if="s.id !== activeId || !linked"
        size="xs"
        icon="i-lucide-circle-check"
        label="Make active"
        :loading="busy"
        @click="emit('make-active', s.id)"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        :icon="s.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
        :label="s.pinned ? 'Unpin' : 'Pin'"
        @click="emit('toggle-pin', s.id, !s.pinned)"
      />
      <UButton
        size="xs"
        color="error"
        variant="outline"
        icon="i-lucide-trash-2"
        :disabled="s.id === activeId"
        @click="emit('remove', s.id)"
      />
    </li>
  </ul>
</template>
