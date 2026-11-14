<script setup lang="ts">
const catalog = useCatalog()
const updates = useUpdateChecker()
const toast = useToast()

const { data: apps, refresh } = useAsyncData('apps', async () => {
  const [rows, counts] = await Promise.all([catalog.listApps(), catalog.itemCountsByApp()])
  return rows.map(app => ({ ...app, items: counts[app.appId] ?? 0 }))
})

// Fill in Steam store data (banner, description, ...) for apps that lack it, one at a time,
// updating each card as it arrives. Failures (offline, rate limit) are retried next visit.
let fetchingStore = false
watch(apps, async (rows) => {
  if (fetchingStore || !rows) return
  fetchingStore = true
  try {
    for (const row of rows.filter(r => catalog.storeStale(r))) {
      const updated = await catalog.refreshStore(row).catch(() => null)
      if (updated) Object.assign(row, updated)
    }
  } finally {
    fetchingStore = false
  }
}, { immediate: true })

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
        {{ apps.length }} game(s)
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

      <UEmpty
        v-if="!apps?.length"
        icon="i-lucide-gamepad-2"
        title="No games yet"
        description="Games appear here once you add workshop items for them, or pick one in the sidebar."
        :actions="[{ label: 'Add items', to: '/' }]"
      />
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <GameCard
          v-for="app in apps"
          :key="app.appId"
          :app="app"
          :outdated="updates.outdated.value[app.appId]?.length ?? 0"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
