<script setup lang="ts">
import type { DropdownMenuItem, TableColumn, TableRow } from '@nuxt/ui'
import type { GameItemRow } from '~/types/games'
import { fitsVersion } from '~/lib/adapters/engine'
import { ROUTES } from '~/constants/routes'

// The workshop items of a game: versions, active snapshot, link status and per-row actions.
const props = defineProps<{ rows: GameItemRow[], selected: Set<string>, allSelected: boolean, gameVersion: string | null }>()
const sorting = defineModel<{ id: string, desc: boolean }[]>('sorting', { default: () => [] })
const emit = defineEmits<{
  'toggle': [id: string, on: boolean | 'indeterminate']
  'toggle-all': [on: boolean | 'indeterminate']
  'download': [ids: string[]]
  'link': [rows: GameItemRow[]]
  'unlink': [rows: GameItemRow[]]
  'lock': [rows: GameItemRow[], on: boolean]
  'make-active': [snapshotId: number]
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

/**
 * One item version's colour: green when it fits the game's version; red when none of the
 * item's versions do; gray when this one misses but another fits. Unknown game version: gray.
 */
function versionClass(versions: string[], version: string): string {
  if (!props.gameVersion) return 'text-muted'
  if (fitsVersion(props.gameVersion, version)) return 'text-success'
  return versions.some(v => fitsVersion(props.gameVersion!, v)) ? 'text-muted' : 'text-error'
}

/** The active snapshot is the newest downloaded one. */
const isLatest = (row: GameItemRow) => row.active?.id === row.latest?.id

/** The revision picker of one row: every downloaded snapshot, newest first. */
function snapshotMenu(row: GameItemRow): DropdownMenuItem[] {
  return row.snapshots.map((s) => {
    const versions = s.itemVersions.join(', ') || 'unknown'
    const newest = s.id === row.latest?.id
    const selected = s.id === row.active?.id
    return {
      label: newest ? `${versions} (latest)` : versions,
      description: formatRelative(s.timeUpdated),
      icon: s.pinned && !selected ? 'i-lucide-pin' : undefined,
      // The selected one shows in primary green with a trailing check; it stays clickable.
      color: selected ? 'primary' : 'neutral',
      title: formatTime(s.timeUpdated),
      selected,
      onSelect: selected ? undefined : () => emit('make-active', s.id)
    }
  })
}

// Sortable columns get a value to sort by; their cells are the slots below. Unsorted, rows keep
// the order they come in (by title). The sort is a model so the page can keep it in the URL.
// Every column but the title has a fixed width (the table layout is fixed), so rows line up.
const columns: TableColumn<GameItemRow>[] = [
  { id: 'select', enableSorting: false, meta: { class: { td: 'w-8', th: 'w-8' } } },
  { id: 'title', accessorFn: r => (r.item.title || r.item.id).toLowerCase() },
  // Versions and the active snapshot share one column: sorted by the active revision's date.
  { id: 'versions', accessorFn: r => r.active?.timeUpdated ?? 0, meta: { class: { td: 'w-64', th: 'w-64' } } },
  // Not downloaded: Steam's size, so the column still orders by how big the item is.
  { id: 'size', accessorFn: r => diskSize(r) || r.item.fileSize, meta: { class: { td: 'w-24 text-right font-mono', th: 'w-24 text-right' } } },
  { id: 'link', accessorFn: r => r.link?.status ?? '', meta: { class: { td: 'w-16 text-center', th: 'w-16 text-center' } } },
  { id: 'actions', enableSorting: false, meta: { class: { td: 'w-40 text-right', th: 'w-40' } } }
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
    :ui="{ base: 'table-fixed', td: 'py-0' }"
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
                title="Locked at this version: auto-update skips it and new downloads aren't made active"
              >
                locked
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
        label="Versions"
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
    <!-- Versions and the active snapshot in one cell: two joined boxes opening the revision
         picker. The left one carries the versions and their date, the narrow right one the
         snapshot count (a chevron when there is only one). -->
    <template #versions-cell="{ row }">
      <UDropdownMenu
        v-if="row.original.active"
        :items="snapshotMenu(row.original)"
        :ui="{ content: 'w-60', item: 'py-2', itemDescription: 'text-xs' }"
        :content="{ align: 'start' }"
      >
        <UFieldGroup size="sm">
          <UButton
            color="neutral"
            variant="outline"
            class="h-auto px-2 py-1 text-start font-normal"
            :title="`${formatTime(row.original.active.timeUpdated)} — switch revision`"
          >
            <div class="min-w-0">
              <p class="flex items-center">
                <!-- Too-long versions pan; the (latest) tag sits still inside the same width. -->
                <GameVersionTicker>
                  <template
                    v-for="(v, i) in row.original.active.itemVersions"
                    :key="i"
                  >
                    <span
                      v-if="i"
                      class="text-dimmed"
                    >, </span><span :class="versionClass(row.original.active.itemVersions, v)">{{ v }}</span>
                  </template>
                  <span
                    v-if="!row.original.active.itemVersions.length"
                    class="text-muted"
                  >unknown</span>
                  <template #aside>
                    <span
                      v-if="isLatest(row.original)"
                      class="text-dimmed"
                    >(latest)</span>
                  </template>
                </GameVersionTicker>
              </p>
              <p class="text-xs text-muted">
                {{ formatRelative(row.original.active.timeUpdated) }}
              </p>
            </div>
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            class="w-8 justify-center px-0 tabular-nums"
            :title="row.original.count > 1 ? `${row.original.count} snapshots — pick another` : 'Switch revision'"
          >
            <span v-if="row.original.count > 1">{{ row.original.count }}</span>
            <UIcon
              v-else
              name="i-lucide-chevron-down"
              class="size-3.5"
            />
          </UButton>
        </UFieldGroup>
        <template #trailing="{ item }">
          <UIcon
            v-if="(item as { selected?: boolean }).selected"
            name="i-lucide-circle-check"
            class="size-4 text-primary"
          />
        </template>
      </UDropdownMenu>
      <span
        v-else
        class="text-muted"
      >—</span>
    </template>
    <template #link-cell="{ row }">
      <UTooltip
        v-if="row.original.link"
        :text="row.original.link.status.replace('_', ' ')"
      >
        <UIcon
          :name="row.original.link.status === 'ok' ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
          class="size-4"
          :class="row.original.link.status === 'ok' ? 'text-success' : 'text-error'"
        />
      </UTooltip>
      <UTooltip
        v-else
        text="not linked"
      >
        <UIcon
          name="i-lucide-unlink"
          class="size-4 text-dimmed"
        />
      </UTooltip>
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
          title="Unlock: follow updates again"
          @click="emit('lock', [row.original], false)"
        />
        <UButton
          v-else
          size="xs"
          color="neutral"
          variant="ghost"
          icon="i-lucide-lock"
          title="Lock at this version: auto-update skips it and new downloads aren't made active"
          @click="emit('lock', [row.original], true)"
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
