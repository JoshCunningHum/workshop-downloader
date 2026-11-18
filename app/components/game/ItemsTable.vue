<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { GameItemRow } from '~/types/games'
import { ROUTES } from '~/constants/routes'

// The workshop items of a game: versions, active snapshot, link status and per-row actions.
const props = defineProps<{ rows: GameItemRow[], selected: Set<string>, allSelected: boolean }>()
const emit = defineEmits<{
  'toggle': [id: string, on: boolean | 'indeterminate']
  'toggle-all': [on: boolean | 'indeterminate']
  'download': [ids: string[]]
  'link': [rows: GameItemRow[]]
  'unlink': [rows: GameItemRow[]]
}>()

const jobsStore = useJobs()

// Select mode (something is ticked): clicking anywhere on a row toggles it, except on its
// links, buttons and checkbox, which keep their own behaviour. Ticked rows are tinted green.
const selecting = computed(() => props.selected.size > 0)
function toggleRow(_event: Event, row: TableRow<GameItemRow>) {
  const id = row.original.item.id
  emit('toggle', id, !props.selected.has(id))
}
const meta = computed(() => ({
  class: {
    // `!`: the table's own hover background would otherwise win over the tint.
    tr: (row: TableRow<GameItemRow>) => [
      selecting.value ? 'cursor-pointer' : '',
      props.selected.has(row.original.item.id) ? 'bg-primary/10! hover:bg-primary/15!' : ''
    ].join(' ').trim()
  }
}))

/** Downloaded size (active snapshot, else the newest), or 0 when nothing is downloaded. */
const diskSize = (row: GameItemRow) => row.active?.sizeBytes || row.latest?.sizeBytes || 0

// Sortable columns get a value to sort by; their cells are the slots below. Unsorted, rows keep
// the order they come in (by title).
const sorting = ref<{ id: string, desc: boolean }[]>([])
const columns: TableColumn<GameItemRow>[] = [
  { id: 'select', enableSorting: false },
  { id: 'title', accessorFn: r => (r.item.title || r.item.id).toLowerCase() },
  { id: 'versions', accessorFn: r => r.active?.itemVersions.join(', ') ?? '' },
  { id: 'active', accessorFn: r => r.active?.timeUpdated ?? 0 },
  // Not downloaded: Steam's size, so the column still orders by how big the item is.
  { id: 'size', accessorFn: r => diskSize(r) || r.item.fileSize },
  { id: 'link', accessorFn: r => r.link?.status ?? '' },
  { id: 'actions', enableSorting: false }
]
</script>

<template>
  <UTable
    v-model:sorting="sorting"
    :data="rows"
    :columns="columns"
    :meta="meta"
    :on-select="selecting ? toggleRow : undefined"
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
              :to="ROUTES.item(row.original.item.id)"
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
    <template #title-header="{ column }">
      <GameSortHeader
        :column="column"
        label="Item"
      />
    </template>
    <template #versions-header="{ column }">
      <GameSortHeader
        :column="column"
        label="Item versions"
      />
    </template>
    <template #active-header="{ column }">
      <GameSortHeader
        :column="column"
        label="Active snapshot"
      />
    </template>
    <template #size-header="{ column }">
      <GameSortHeader
        :column="column"
        label="Size"
      />
    </template>
    <template #link-header="{ column }">
      <GameSortHeader
        :column="column"
        label="Link"
      />
    </template>
    <template #size-cell="{ row }">
      <span
        v-if="diskSize(row.original)"
        class="tabular-nums"
      >{{ formatBytes(diskSize(row.original)) }}</span>
      <span
        v-else
        class="text-muted tabular-nums"
        title="Not downloaded; size on Steam"
      >{{ formatBytes(row.original.item.fileSize) }}</span>
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
