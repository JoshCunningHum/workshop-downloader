<script setup lang="ts">
// A game: store header, info bar, and either its item table or its settings.
const route = useRoute()
const appId = Number(route.params.appId)

const page = useGamePage(appId)
const { data, refresh, app, gameVersion, busy, run, checkUpdates, verifyLinks, detectGameVersion, detectAdapter } = page
const items = useGameItems(appId, page)
const { visibleRows, search, outdatedIds, selected, allSelected, selectedRows } = items

// The item list, or the game's settings (opened from the gear button).
const view = ref<'items' | 'settings'>('items')
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
          :can-update="outdatedIds.length > 0"
          :settings-open="view === 'settings'"
          @detect="detectGameVersion"
          @detect-adapter="detectAdapter"
          @update-outdated="items.download(outdatedIds)"
          @check-updates="checkUpdates"
          @verify-links="verifyLinks"
          @open-settings="view = 'settings'"
        />

        <template v-if="view === 'items'">
          <GameSelectionBar
            :count="selected.size"
            @download="items.download([...selected])"
            @link="items.link(selectedRows())"
            @unlink="items.unlink(selectedRows())"
            @remove="items.remove(selectedRows())"
          />
          <GameItemsTable
            :rows="visibleRows"
            :selected="selected"
            :all-selected="allSelected"
            @toggle="items.toggle"
            @toggle-all="items.toggleAll"
            @download="items.download"
            @link="items.link"
            @unlink="items.unlink"
          />
        </template>

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
