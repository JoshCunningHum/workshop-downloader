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
        <NuxtLink
          v-for="app in apps"
          :key="app.appId"
          :to="`/apps/${app.appId}`"
          class="flex overflow-hidden rounded-lg border border-default bg-default transition-colors hover:bg-elevated/50"
        >
          <img
            v-if="app.store?.headerImage"
            :src="app.store.headerImage"
            alt=""
            class="aspect-460/215 w-44 shrink-0 object-cover"
            loading="lazy"
          >
          <div
            v-else
            class="flex aspect-460/215 w-44 shrink-0 items-center justify-center bg-elevated"
          >
            <UIcon
              name="i-lucide-gamepad-2"
              class="size-8 text-dimmed"
            />
          </div>

          <div class="min-w-0 flex-1 space-y-1 p-3">
            <p class="truncate font-medium text-highlighted">
              {{ app.name ?? `App ${app.appId}` }}
            </p>
            <p class="text-xs text-muted">
              AppID {{ app.appId }} · {{ app.items }} item(s)
            </p>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-if="updates.outdated.value[app.appId]?.length"
                size="sm"
                color="warning"
                variant="subtle"
              >
                {{ updates.outdated.value[app.appId]!.length }} update(s)
              </UBadge>
              <UBadge
                v-if="app.manualGameVersion || app.detectedGameVersion"
                size="sm"
                color="neutral"
                variant="subtle"
              >
                game {{ app.manualGameVersion || app.detectedGameVersion }}
              </UBadge>
              <UBadge
                v-if="!app.installPath"
                size="sm"
                color="neutral"
                variant="outline"
              >
                install folder unknown
              </UBadge>
            </div>
          </div>
        </NuxtLink>
      </div>
    </template>
  </UDashboardPanel>
</template>
