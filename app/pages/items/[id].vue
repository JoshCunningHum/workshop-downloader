<script setup lang="ts">
import { ROUTES } from '~/constants/routes'
import { itemPage } from '~/lib/services/workshop-browser'

// A workshop item: back to its game, its details card, and the snapshots it keeps.
const route = useRoute()
const id = String(route.params.id)
const { data, gameVersion, downloading, busy, makeActive, togglePin, remove, unlink, redetect, download, setAutoUpdate, releaseHold } = useItemPage(id)

const itemLinks = useItemLinks()
const updateAvailable = computed(() => {
  if (!data.value) return false
  const latest = Math.max(0, ...data.value.snapshots.map(s => s.timeUpdated))
  return data.value.item.remoteTimeUpdated > latest
})
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UEmpty
        v-if="!data"
        title="Item not found"
        :actions="[{ label: 'All games', to: ROUTES.games }]"
      />

      <template v-else>
        <div>
          <UButton
            :to="ROUTES.game(data.item.appId)"
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            :label="data.app?.name ?? `App ${data.item.appId}`"
          />
        </div>

        <WorkshopItemSummary
          :item="data.item"
          :app="data.app"
          :link="data.link"
          :game-version="gameVersion"
          :downloading="downloading"
          :update-available="updateAvailable"
          :busy="busy"
          :can-redetect="!!data.snapshots.length && !!data.app"
          @auto-update="setAutoUpdate"
          @download="download"
          @open-workshop="itemLinks.open(itemPage(data.item.id))"
          @redetect="redetect"
          @unlink="unlink"
          @release-hold="releaseHold"
        />

        <section class="space-y-2">
          <div class="flex items-baseline gap-2">
            <h2 class="font-semibold">
              Snapshots
            </h2>
            <span class="text-sm text-muted">
              {{ data.snapshots.length }} kept<template v-if="data.app?.retention"> · up to {{ data.app.retention }} plus pinned and active</template>
            </span>
          </div>

          <UEmpty
            v-if="!data.snapshots.length"
            icon="i-lucide-history"
            title="No snapshots yet"
            description="Each download keeps its revision here, so you can switch back later."
          />

          <WorkshopItemSnapshotList
            v-else
            :snapshots="data.snapshots"
            :active-id="data.item.activeSnapshotId"
            :linked="!!data.link"
            :game-version="gameVersion"
            :busy="busy"
            @make-active="makeActive"
            @toggle-pin="togglePin"
            @remove="remove"
          />
        </section>
      </template>
    </template>
  </UDashboardPanel>
</template>
