<script setup lang="ts">
// A workshop item: its details and the snapshots it keeps.
const route = useRoute()
const { data, gameVersion, downloading, busy, makeActive, togglePin, remove, unlink, redetect, download, setAutoUpdate, releaseHold } = useItemPage(String(route.params.id))
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UEmpty
        v-if="!data"
        title="Item not found"
      />

      <template v-else>
        <WorkshopItemSummary
          :item="data.item"
          :app="data.app"
          :link="data.link"
          :game-version="gameVersion"
          :downloading="downloading"
          @auto-update="setAutoUpdate"
          @download="download"
        />

        <div class="flex items-center gap-2">
          <h2 class="font-semibold">
            Snapshots
          </h2>
          <UButton
            class="ms-auto"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-scan-search"
            label="Re-detect versions"
            :disabled="!data.snapshots.length || !data.app"
            :loading="busy"
            @click="redetect"
          />
          <UButton
            v-if="data.item.held"
            size="xs"
            color="info"
            variant="outline"
            icon="i-lucide-lock-open"
            label="Release hold"
            title="Held at this version: auto-update skips it and new downloads aren't made active"
            :loading="busy"
            @click="releaseHold"
          />
          <UButton
            v-if="data.link"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-unlink"
            label="Unlink"
            :loading="busy"
            @click="unlink"
          />
        </div>

        <UEmpty
          v-if="!data.snapshots.length"
          icon="i-lucide-history"
          title="No snapshots yet"
          description="Each download keeps its revision here, so you can switch back later."
        />

        <WorkshopItemSnapshotList
          :snapshots="data.snapshots"
          :active-id="data.item.activeSnapshotId"
          :linked="!!data.link"
          :game-version="gameVersion"
          :busy="busy"
          @make-active="makeActive"
          @toggle-pin="togglePin"
          @remove="remove"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
