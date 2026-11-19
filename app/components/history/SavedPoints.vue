<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { RestorePointRow } from '~/lib/db/schema'

// The game's saved restore points, newest first: name, time and items linked, with Restore and
// a menu to show it on the ruler or delete it.
defineProps<{ points: RestorePointRow[], busy: boolean }>()
const emit = defineEmits<{ restore: [point: RestorePointRow], show: [point: RestorePointRow], delete: [point: RestorePointRow] }>()

const linkedCount = (p: RestorePointRow) => Object.values(p.state).filter(id => id !== null).length
const menu = (p: RestorePointRow): DropdownMenuItem[][] => [
  [{ label: 'Show on the timeline', icon: 'i-lucide-calendar-search', onSelect: () => emit('show', p) }],
  [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => emit('delete', p) }]
]
</script>

<template>
  <section class="rounded-lg border border-default">
    <h3 class="flex items-center gap-2 border-b border-default px-4 py-2.5 text-sm font-semibold text-highlighted">
      <UIcon
        name="i-lucide-flag"
        class="size-4 text-error"
      />
      Saved restore points
    </h3>
    <p
      v-if="!points.length"
      class="px-4 py-6 text-center text-sm text-muted"
    >
      None yet. Save one before trying new mods to get back to it in one click.
    </p>
    <ul
      v-else
      class="max-h-[28rem] divide-y divide-default overflow-y-auto"
    >
      <li
        v-for="p in points"
        :key="p.id"
        class="flex items-center gap-2 px-4 py-2.5"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">
            {{ p.label || 'Saved restore point' }}
          </p>
          <p class="text-xs text-muted">
            {{ formatMs(p.createdAt) }} · {{ linkedCount(p) }} linked
          </p>
        </div>
        <UButton
          size="xs"
          color="neutral"
          variant="outline"
          label="Restore"
          :loading="busy"
          @click="emit('restore', p)"
        />
        <UDropdownMenu
          :items="menu(p)"
          :content="{ align: 'end' }"
        >
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-ellipsis-vertical"
            aria-label="Restore point actions"
          />
        </UDropdownMenu>
      </li>
    </ul>
  </section>
</template>
