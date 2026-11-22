<script setup lang="ts">
// A game: store header, info bar, and its item table, settings or history.
const route = useRoute()
const appId = Number(route.params.appId)

const page = useGamePage(appId)
const { data, refresh, app, gameVersion, busy, run, checkUpdates, verifyLinks, detectGameVersion, detectAdapter } = page
const items = useGameItems(appId, page)
const { visibleRows, search, sorting, outdatedIds, selected, allSelected, selectedRows } = items

// The item list, the game's settings (gear button) or its history (history button).
const view = ref<'items' | 'settings' | 'history'>('items')
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <WorkshopLinkSection />

      <UEmpty
        v-if="!app || !data"
        title="Unknown game"
        description="This AppID has no items yet."
      />

      <template v-else>
        <GameStoreHeader :app="app" />

        <GameInfoBar
          v-model:search="search"
          :app="app"
          :game-version="gameVersion"
          :adapter-name="data.adapter.name"
          :busy="busy"
          :outdated-count="outdatedIds.length"
          :view="view"
          @detect="detectGameVersion"
          @detect-adapter="detectAdapter"
          @update-outdated="items.download(outdatedIds)"
          @check-updates="checkUpdates"
          @verify-links="verifyLinks"
          @open-view="view = $event"
        >
          <GameSelectionBar
            v-if="view === 'items'"
            :count="selected.size"
            @download="items.download([...selected])"
            @link="items.link(selectedRows())"
            @unlink="items.unlink(selectedRows())"
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
          @toggle="items.toggle"
          @toggle-all="items.toggleAll"
          @download="items.download"
          @link="items.link"
          @unlink="items.unlink"
          @release="items.release"
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
