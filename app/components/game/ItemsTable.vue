<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { GameItemRow } from '~/types/games'

// The workshop items of a game: versions, active snapshot, link status and per-row actions.
defineProps<{ rows: GameItemRow[], selected: Set<string>, allSelected: boolean }>()
const emit = defineEmits<{
  'toggle': [id: string, on: boolean | 'indeterminate']
  'toggle-all': [on: boolean | 'indeterminate']
  'download': [ids: string[]]
  'link': [rows: GameItemRow[]]
  'unlink': [rows: GameItemRow[]]
}>()

const jobsStore = useJobs()

const columns: TableColumn<GameItemRow>[] = [
  { id: 'select' },
  { id: 'title', header: 'Item' },
  { id: 'versions', header: 'Item versions' },
  { id: 'active', header: 'Active snapshot' },
  { id: 'link', header: 'Link' },
  { id: 'actions' }
]
</script>

<template>
  <UTable
    :data="rows"
    :columns="columns"
    :ui="{ td: 'py-0' }"
  >
    <template #select-header>
      <UCheckbox
        :model-value="allSelected"
        @update:model-value="emit('toggle-all', $event)"
      />
    </template>
    <template #select-cell="{ row }">
      <UCheckbox
        :model-value="selected.has(row.original.item.id)"
        @update:model-value="emit('toggle', row.original.item.id, $event)"
      />
    </template>
    <template #title-cell="{ row }">
      <WorkshopItemTooltip :item-id="row.original.item.id">
        <div class="flex h-13 items-center gap-3">
          <WorkshopItemThumbnail
            :src="row.original.item.previewUrl"
            class="size-13"
          />
          <div class="min-w-0">
            <NuxtLink
              :to="`/items/${row.original.item.id}`"
              class="font-medium hover:underline"
            >
              {{ row.original.item.title || row.original.item.id }}
            </NuxtLink>
            <div class="flex gap-1">
              <UBadge
                v-if="row.original.updateAvailable"
                size="sm"
                color="warning"
                variant="subtle"
              >
                {{ row.original.latest ? 'update available' : 'not downloaded' }}
              </UBadge>
              <UBadge
                v-if="jobsStore.busyItemIds.value.has(row.original.item.id)"
                size="sm"
                color="primary"
                variant="subtle"
              >
                downloading
              </UBadge>
            </div>
          </div>
        </div>
      </WorkshopItemTooltip>
    </template>
    <template #versions-cell="{ row }">
      <span>{{ row.original.active?.itemVersions.join(', ') || '—' }}</span>
      <UBadge
        v-if="row.original.compatible !== null"
        class="ms-2"
        size="sm"
        :color="row.original.compatible ? 'success' : 'error'"
        variant="subtle"
      >
        {{ row.original.compatible ? 'fits' : 'mismatch' }}
      </UBadge>
    </template>
    <template #active-cell="{ row }">
      <span v-if="row.original.active">{{ formatTime(row.original.active.timeUpdated) }}</span>
      <span
        v-else
        class="text-muted"
      >—</span>
      <span class="text-xs text-muted"> ({{ row.original.count }} kept)</span>
    </template>
    <template #link-cell="{ row }">
      <UBadge
        v-if="row.original.link"
        :color="row.original.link.status === 'ok' ? 'success' : 'error'"
        variant="subtle"
      >
        {{ row.original.link.status.replace('_', ' ') }}
      </UBadge>
      <span
        v-else
        class="text-muted"
      >not linked</span>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-1">
        <OpenFolderButton
          :path="row.original.link?.linkPath ?? row.original.active?.path ?? row.original.latest?.path"
          size="xs"
          variant="ghost"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-download"
          title="Download latest"
          @click="emit('download', [row.original.item.id])"
        />
        <UButton
          v-if="row.original.link"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-unlink"
          title="Unlink"
          @click="emit('unlink', [row.original])"
        />
        <UButton
          v-else-if="row.original.latest"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-link"
          title="Link"
          @click="emit('link', [row.original])"
        />
      </div>
    </template>
  </UTable>
</template>
