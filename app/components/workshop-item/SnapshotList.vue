<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { isCompatible } from '~/lib/adapters/engine'
import type { SnapshotRow } from '~/lib/db/schema'
import { openInFileManager } from '~/lib/services/files'

// The downloaded revisions of an item. Each row offers "Make active" when it isn't the linked
// one; opening its folder, pinning and deleting are in its menu.
const props = defineProps<{
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

const attempt = useAttempt()

function menu(s: SnapshotRow): DropdownMenuItem[][] {
  const active = s.id === props.activeId
  return [
    [
      { label: 'Open folder', icon: 'i-lucide-folder-open', onSelect: () => attempt('Opening folder', () => openInFileManager(s.path)) },
      { label: s.pinned ? 'Unpin' : 'Pin (keep always)', icon: s.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin', onSelect: () => emit('toggle-pin', s.id, !s.pinned) }
    ],
    [
      { label: active ? 'Delete (make another active first)' : 'Delete', icon: 'i-lucide-trash-2', color: 'error', disabled: active, onSelect: () => emit('remove', s.id) }
    ]
  ]
}
</script>

<template>
  <ul class="divide-y divide-default rounded-lg border border-default">
    <li
      v-for="s in snapshots"
      :key="s.id"
      class="flex items-center gap-3 px-4 py-2.5"
      :class="s.id === activeId ? 'bg-primary/5' : ''"
    >
      <UIcon
        :name="s.id === activeId ? 'i-lucide-circle-check' : 'i-lucide-circle'"
        class="size-4 shrink-0"
        :class="s.id === activeId ? 'text-primary' : 'text-dimmed'"
      />
      <div class="min-w-0 flex-1">
        <p class="flex flex-wrap items-center gap-1.5 text-sm">
          <span class="font-medium text-highlighted">{{ formatTime(s.timeUpdated) }}</span>
          <UBadge
            v-if="s.id === activeId"
            size="sm"
            color="primary"
            variant="subtle"
          >
            {{ linked ? 'active' : 'active, not linked' }}
          </UBadge>
          <UBadge
            v-if="s.pinned"
            size="sm"
            color="neutral"
            variant="subtle"
            icon="i-lucide-pin"
          >
            pinned
          </UBadge>
          <UBadge
            v-if="isCompatible(gameVersion, s.itemVersions) === false"
            size="sm"
            color="error"
            variant="subtle"
          >
            doesn't list {{ gameVersion }}
          </UBadge>
        </p>
        <p
          class="truncate text-xs text-muted"
          :title="s.path"
        >
          {{ formatBytes(s.sizeBytes) }} · downloaded {{ formatMs(s.downloadedAt) }}
          · versions {{ s.itemVersions.join(', ') || 'unknown' }}
        </p>
      </div>
      <UButton
        v-if="s.id !== activeId || !linked"
        size="sm"
        color="neutral"
        variant="outline"
        :label="s.id === activeId ? 'Link' : 'Make active'"
        :loading="busy"
        @click="emit('make-active', s.id)"
      />
      <UDropdownMenu
        :items="menu(s)"
        :content="{ align: 'end' }"
      >
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-ellipsis-vertical"
          aria-label="Snapshot actions"
        />
      </UDropdownMenu>
    </li>
  </ul>
</template>
