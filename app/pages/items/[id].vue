<script setup lang="ts">
import { ROUTES } from '~/constants/routes'
import { itemPage } from '~/lib/services/workshop-browser'

// A workshop item: back to its game, its details card, and the snapshots it keeps.
const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const { data, status, gameVersion, downloading, busy, makeActive, togglePin, remove, unlink, redetect, download, setAutoUpdate, setLock } = useItemPage(id)

// Back to the game with its search and sort intact (they live in its URL); a direct visit
// to this item has no such page to return to.
function goBack() {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous.startsWith(`${ROUTES.games}/`)) router.back()
  else if (data.value) router.push(ROUTES.game(data.value.item.appId))
}

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
      <!-- First visit only: later ones show the cached data, even while it refreshes. -->
      <div
        v-if="status === 'pending' && !data"
        class="space-y-3"
      >
        <USkeleton class="h-9 w-40" />
        <USkeleton class="h-36 w-full max-w-3xl" />
        <USkeleton class="h-16 w-full max-w-3xl" />
        <USkeleton class="h-40 w-full max-w-3xl" />
      </div>

      <UEmpty
        v-else-if="!data"
        title="Item not found"
        :actions="[{ label: 'All games', to: ROUTES.games }]"
      />

      <template v-else>
        <div>
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            :label="data.app?.name ?? `App ${data.item.appId}`"
            @click="goBack"
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
          @lock="setLock"
        />

        <section class="space-y-2">
          <div class="flex items-baseline gap-2">
            <h2 class="font-semibold">
              Snapshots
            </h2>
            <UBadge
              v-if="data.snapshots.length > 1"
              size="sm"
              color="neutral"
              variant="subtle"
            >
              {{ data.snapshots.length }}
            </UBadge>
            <span
              v-if="data.app?.retention"
              class="text-sm text-muted"
            >
              up to {{ data.app.retention }} plus pinned and active
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
