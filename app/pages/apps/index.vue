<script setup lang="ts">
import { count, eq } from 'drizzle-orm'
import { workshopItems } from '~/db/schema'

const catalog = useCatalog()
const updates = useUpdateChecker()
const { db } = useDb()
const toast = useToast()

const { data: apps, refresh } = useAsyncData('apps', async () => {
  const rows = await catalog.listApps()
  return Promise.all(rows.map(async app => ({
    ...app,
    items: (await db().select({ n: count() }).from(workshopItems).where(eq(workshopItems.appId, app.appId)))[0]?.n ?? 0
  })))
})

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
    <template #header>
      <UDashboardNavbar title="Games">
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            label="Check for updates"
            color="neutral"
            variant="outline"
            :loading="updates.checking.value"
            @click="checkAll"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        v-if="!apps?.length"
        icon="i-lucide-gamepad-2"
        title="No games yet"
        description="Games appear here once you add workshop items for them."
        :actions="[{ label: 'Add items', to: '/add' }]"
      />
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <UPageCard
          v-for="app in apps"
          :key="app.appId"
          :to="`/apps/${app.appId}`"
          :title="app.name ?? `App ${app.appId}`"
          :description="`AppID ${app.appId} · ${app.items} item(s)`"
        >
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-if="updates.outdated.value[app.appId]?.length"
              color="warning"
              variant="subtle"
            >
              {{ updates.outdated.value[app.appId]!.length }} update(s)
            </UBadge>
            <UBadge
              v-if="app.manualGameVersion || app.detectedGameVersion"
              color="neutral"
              variant="subtle"
            >
              game {{ app.manualGameVersion || app.detectedGameVersion }}
            </UBadge>
            <UBadge
              v-if="!app.installPath"
              color="neutral"
              variant="outline"
            >
              install folder unknown
            </UBadge>
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
