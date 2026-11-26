<script setup lang="ts">
// A game: store header, info bar, and its item table, settings or history.
const route = useRoute()
const appId = Number(route.params.appId)

const page = useGamePage(appId)
const { data, refresh, status, app, gameVersion, busy, run, checkUpdates, verifyLinks, detectGameVersion, detectAdapter } = page
const items = useGameItems(appId, page)
const { visibleRows, search, sorting, outdatedIds, selected, allSelected, selectedRows } = items

// The item list, the game's settings (gear button) or its history (history button).
const view = ref<'items' | 'settings' | 'history'>('items')

// A search text or a sort is active; the info bar offers to clear both.
const filtered = computed(() => !!search.value.trim() || !!sorting.value.length)
const clearFilters = () => {
  search.value = ''
  sorting.value = []
}

// Snapshots on disk in the library: the active ones, the inactive ones, and their total.
const disk = computed(() => diskUsage(data.value?.items ?? [], data.value?.snapshots ?? []))
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <WorkshopLinkSection />

      <!-- First visit only: later ones show the cached data, even while it refreshes. -->
      <div
        v-if="status === 'pending' && !data"
        class="space-y-3"
      >
        <USkeleton class="h-20 w-full max-w-3xl" />
        <USkeleton class="h-9 w-full max-w-2xl" />
        <USkeleton class="h-72 w-full" />
      </div>

      <UEmpty
        v-else-if="!app || !data"
        title="Unknown game"
        description="This AppID has no items yet."
      />

      <template v-else>
        <div class="flex items-start justify-between gap-4">
          <GameStoreHeader
            :app="app"
            class="min-w-0 flex-1"
          />
          <div
            v-if="disk"
            class="shrink-0 space-y-1 rounded-lg border border-default p-3"
          >
            <p class="text-xs font-semibold text-highlighted">
              On disk
            </p>
            <GameDiskUsage v-bind="disk" />
          </div>
        </div>

        <GameInfoBar
          v-model:search="search"
          :app="app"
          :game-version="gameVersion"
          :adapter-name="data.adapter.name"
          :busy="busy"
          :outdated-count="outdatedIds.length"
          :view="view"
          :filtered="filtered"
          @detect="detectGameVersion"
          @detect-adapter="detectAdapter"
          @update-outdated="items.download(outdatedIds)"
          @check-updates="checkUpdates"
          @verify-links="verifyLinks"
          @open-view="view = $event"
          @clear="clearFilters"
        >
          <GameSelectionBar
            v-if="view === 'items'"
            :count="selected.size"
            :any-locked="selectedRows().some(r => r.item.held)"
            @download="items.download([...selected])"
            @link="items.link(selectedRows())"
            @unlink="items.unlink(selectedRows())"
            @lock="items.setLock(selectedRows(), $event)"
            @delete-duplicates="items.deleteDuplicates(selectedRows())"
            @remove="items.remove(selectedRows())"
          />
        </GameInfoBar>

        <GameItemsTable
          v-if="view === 'items'"
          v-model:sorting="sorting"
          :rows="visibleRows"
          :selected="selected"
          :all-selected="allSelected"
          :game-version="gameVersion"
          @toggle="items.toggle"
          @toggle-all="items.toggleAll"
          @download="items.download"
          @link="items.link"
          @unlink="items.unlink"
          @lock="items.setLock"
          @make-active="items.makeActive"
        />

        <HistoryPanel
          v-else-if="view === 'history'"
          :app-id="appId"
          :page="page"
          @back="view = 'items'"
        />

        <GameSettingsForm
          v-else
          :app="app"
          :adapter="data.adapter"
          :adapters="data.adapters"
          :accounts="data.accounts"
          :busy="busy"
          :run="run"
          @back="view = 'items'"
          @imported="refresh"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
