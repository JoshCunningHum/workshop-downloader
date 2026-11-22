<script setup lang="ts">
import { ROUTES } from '~/constants/routes'

const updates = useUpdateChecker()
const toast = useToast()
const { apps, refresh, status } = useGameList()

// Hidden games (left out of the sidebar) are listed only when asked for.
const showHidden = ref(false)
const hiddenCount = computed(() => apps.value?.filter(a => a.hidden).length ?? 0)
const visibleApps = computed(() => apps.value?.filter(a => showHidden.value || !a.hidden) ?? [])

async function checkAll() {
  try {
    const items = await updates.check()
    toast.add({ title: items?.length ? `${items.length} update(s) available` : 'Everything is up to date', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: 'Update check failed', description: String(e), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <div
        v-if="apps?.length"
        class="flex items-center gap-2 text-sm text-muted"
      >
        {{ apps.length - hiddenCount }} game(s)
        <USwitch
          v-if="hiddenCount"
          v-model="showHidden"
          size="sm"
          :label="`Show hidden (${hiddenCount})`"
          class="ms-3"
        />
        <UButton
          class="ms-auto"
          size="xs"
          icon="i-lucide-refresh-cw"
          label="Check for updates"
          color="neutral"
          variant="outline"
          :loading="updates.checking.value"
          @click="checkAll"
        />
      </div>

      <!-- First visit only: later ones show the cached list, even while it refreshes. -->
      <div
        v-if="status === 'pending' && !apps"
        class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        <USkeleton
          v-for="n in 6"
          :key="n"
          class="h-28"
        />
      </div>

      <UEmpty
        v-else-if="!apps?.length"
        icon="i-lucide-gamepad-2"
        title="No games yet"
        description="Games appear here once you add workshop items for them, or pick one in the sidebar."
        :actions="[{ label: 'Add items', to: ROUTES.home }]"
      />
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <GameCard
          v-for="app in visibleApps"
          :key="app.appId"
          :app="app"
          :outdated="updates.outdated.value[app.appId]?.length ?? 0"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
