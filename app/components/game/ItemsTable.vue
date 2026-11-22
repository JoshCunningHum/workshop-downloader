<script setup lang="ts">
import type { TableColumn, TableRow } from '@nuxt/ui'
import type { GameItemRow } from '~/types/games'
import { ROUTES } from '~/constants/routes'
// The workshop items of a game: versions, active snapshot, link status and per-row actions.
const props = defineProps<{ rows: GameItemRow[], selected: Set<string>, allSelected: boolean }>()
const sorting = defineModel<{ id: string, desc: boolean }[]>('sorting', { default: () => [] })
const emit = defineEmits<{
  'toggle': [id: string, on: boolean | 'indeterminate']
  'toggle-all': [on: boolean | 'indeterminate']
  'download': [ids: string[]]
  'link': [rows: GameItemRow[]]
  'unlink': [rows: GameItemRow[]]
  'release': [rows: GameItemRow[]]
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
// the order they come in (by title). The sort is a model so the page can keep it in the URL.
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

// Only the visible rows mount (each carries a tooltip and a thumbnail). The page's scrollable
// panel stays the scroll container; the virtualizer rides on it.
const table = useTemplateRef<{ $el: HTMLElement | null }>('table')
function scrollElement(): HTMLElement | null {
  // The first overflow-scrolling ancestor is the panel body — even before any row has
  // rendered and made it actually overflow.
  let el = table.value?.$el ?? null
  while (el) {
    const { overflowY } = getComputedStyle(el)
    if (overflowY === 'auto' || overflowY === 'scroll') return el
    el = el.parentElement
  }
  return null
}
// Reactive so the table re-reads `scrollMargin` after mount, once the DOM exists.
const virtualize = reactive({
  getScrollElement: scrollElement,
  // Distance from the panel's top to the table's, so rows map correctly while scrolled.
  get scrollMargin() {
    const el = table.value?.$el
    const scroller = scrollElement()
    if (!el || !scroller) return 0
    return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
  },
  estimateSize: 52,
  overscan: 8
})
</script>

<template>
  <UTable
    ref="table"
    v-model:sorting="sorting"
    :virtualize="virtualize"
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
              <UBadge
                v-if="row.original.item.held"
                size="sm"
                color="info"
                variant="subtle"
                title="Held at this version: auto-update skips it and new downloads aren't made active"
              >
                held
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
      <span
        v-if="row.original.active"
        :title="formatTime(row.original.active.timeUpdated)"
      >{{ formatRelative(row.original.active.timeUpdated) }}</span>
      <span
        v-else
        class="text-muted"
      >—</span>
      <UBadge
        v-if="row.original.count > 1"
        class="ms-2"
        size="sm"
        color="neutral"
        variant="subtle"
      >
        {{ row.original.count }}
      </UBadge>
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
          v-if="row.original.item.held"
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-lock-open"
          title="Release hold"
          @click="emit('release', [row.original])"
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
